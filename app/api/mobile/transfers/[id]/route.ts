import { postOutletDelivery, OutletDeliveryPostingError } from "@/lib/post-outlet-delivery";
import { outletProductClassification } from "@/lib/outlet-product-classification";
import { weightedCompanyCost } from "@/lib/company-cost";
// app/api/mobile/transfers/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import { requireMobileAuth } from "@/lib/mobile-auth";
import connectDb from "@/lib/mongodb";
import StockTransferModel from "@/models/StockTransfer";
import StockTransferItemModel from "@/models/StockTransferItem";
import { packingSnapshot, toBaseUnitCost } from "@/lib/inventory-units";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";

export const dynamic = "force-dynamic";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// GET detail
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireMobileAuth(req, [
    "stock-transfers.confirm",
    "stock-transfers.view",
  ]);
  if (response) return response;
  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "No outlet assigned." },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ success: false, message: "Invalid id." }, { status: 400 });
  }

  await connectDb();

  const transfer = await StockTransferModel.findOne({
    _id: id,
    outletId: user.outlet.id,
  }).lean<any>();
  if (!transfer) {
    return NextResponse.json({ success: false, message: "Transfer not found." }, { status: 404 });
  }

  const items = await StockTransferItemModel.find({ transferId: id }).lean();

  return NextResponse.json({
    success: true,
    transfer: {
      id: transfer._id.toString(),
      transferNumber: transfer.transferNumber || "",
      status: transfer.status,
      items: (items as any[]).map((it) => ({
        id: it._id.toString(),
        productName: it.productName || "",
        unitLabel: it.unitLabel || "PCS",
        packSize: Number(it.packSize || 0),
        qty: Number(it.qty || 0),
      })),
    },
  });
}

// POST confirm: body { items: [{ itemId, receivedQty, remarks? }], outletRemarks? }
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireMobileAuth(req, "stock-transfers.confirm");
  if (response) return response;
  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "No outlet assigned." },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ success: false, message: "Invalid id." }, { status: 400 });
  }

  await connectDb();

  let body: { items?: Array<{ itemId?: string; receivedQty?: number; remarks?: string }>; outletRemarks?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }

  const receivedMap = new Map<string, { receivedQty: number; remarks: string }>();
  for (const i of body?.items || []) {
    if (i?.itemId) {
      receivedMap.set(String(i.itemId), {
        receivedQty: Math.trunc(Number(i.receivedQty)),
        remarks: String(i.remarks || "").trim(),
      });
    }
  }

  const mongoSession = await mongoose.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      // Atomically claim a dispatched transfer. A second confirmation cannot
      // pass this state guard, and a failed transaction rolls the claim back.
      const transfer = await StockTransferModel.findOneAndUpdate(
        {
          _id: id,
          outletId: user.outlet!.id,
          status: { $in: ["IN_TRANSIT", "DELIVERED"] },
        },
        {
          $set: {
            status: "CONFIRMED",
            confirmedAt: new Date(),
            confirmedBy: user.id,
            deliveredAt: new Date(),
          },
        },
        { new: true, session: mongoSession }
      );

      if (!transfer) {
        const existing = await StockTransferModel.findOne({
          _id: id,
          outletId: user.outlet!.id,
        })
          .select("status")
          .session(mongoSession)
          .lean();
        if (!existing) throw new ApiError(404, "Transfer not found.");
        throw new ApiError(
          400,
          existing.status === "DRAFT"
            ? "This transfer has not been dispatched yet."
            : existing.status === "CONFIRMED"
              ? "This transfer is already confirmed."
              : "This transfer cannot be confirmed."
        );
      }

      const items = await StockTransferItemModel.find({ transferId: id }).session(mongoSession);
      if (items.some(item => item.itemStatus !== "PENDING")) throw new ApiError(409, "This delivery has product-level decisions. Complete it in the web outlet Receive Deliveries page.");

      let totalReceivedQty = 0;
      let totalVarianceQty = 0;

      for (const item of items) {
        const input = receivedMap.get(item._id.toString());
        const receivedQty = input ? input.receivedQty : item.qty;

        if (!Number.isFinite(receivedQty) || receivedQty < 0) {
          throw new ApiError(400, `Invalid received quantity for ${item.productName}.`);
        }
        if (receivedQty > item.qty) {
          throw new ApiError(400, `${item.productName}: received (${receivedQty}) cannot exceed dispatched (${item.qty}).`);
        }

        const varianceQty = item.qty - receivedQty;
        const packSize = Number(item.packSize || 0);
        const unitToPcs = item.unitLabel === "PACK" && packSize > 0 ? packSize : 1;
        const receivedPcs = receivedQty * unitToPcs;
        const variancePcs = varianceQty * unitToPcs;
        const source = item.source === "GROCERY" ? "GROCERY" : "BODEGA";
        const baseUnit =
          item.baseUnit === "KG" ? "KG" : item.baseUnit === "HEAD" || item.unitLabel === "HEAD"
            ? "HEAD"
            : source === "GROCERY"
              ? "QTY"
              : "PCS";

        item.receivedQty = receivedQty;
        item.receivedPcs = receivedPcs;
        item.varianceQty = varianceQty;
        item.itemStatus = receivedQty === 0 ? "REJECTED" : varianceQty > 0 ? "PARTIAL" : "ACCEPTED";
        if (input?.remarks) item.remarks = input.remarks;
        await item.save({ session: mongoSession });

        totalReceivedQty += receivedPcs;
        totalVarianceQty += variancePcs;

        if (receivedPcs <= 0) continue;

        const productRef = source === "GROCERY" ? item.productId : item.bodegaProductId;

        const transferPrice =
          transfer.saleId || Number(item.sellingPrice || 0) > 0
            ? Number(item.sellingPrice)
            : Number(item.buyingPrice || 0);
        const transferPacking = packingSnapshot({
          unit: item.unitLabel,
          baseUnit,
          multiplier: unitToPcs,
        });
        const incomingBaseCost = toBaseUnitCost(transferPrice, transferPacking);

        const existingInventory = await OutletInventoryModel.findOne(
          { outletId: transfer.outletId, productSource: source, productId: productRef, isActive: true },
        ).session(mongoSession);

        let inventoryId = existingInventory?._id;
        const classification = await outletProductClassification(source, productRef, mongoSession, item.categoryName);
        let previousStock = 0;
        let newStock = receivedPcs;

        if (existingInventory) {
          existingInventory.set(classification);
          previousStock = Number(existingInventory.stockQty || 0);
          newStock = previousStock + receivedPcs;
          const existingBaseCost = toBaseUnitCost(
            existingInventory.buyingPrice,
            packingSnapshot({
              unit: Number(existingInventory.packSize || 0) > 0 ? "PACK" : baseUnit,
              baseUnit,
              multiplier: existingInventory.packSize,
            })
          );
          const averageBaseCost =
            newStock > 0
              ? (previousStock * existingBaseCost + receivedPcs * incomingBaseCost) /
                newStock
              : incomingBaseCost;

          existingInventory.companyUnitCost = weightedCompanyCost(previousStock, existingInventory.companyUnitCost, receivedPcs, item.companyUnitCost);
          existingInventory.stockQty = newStock;
          existingInventory.unitLabel = baseUnit;
          existingInventory.packSize = packSize;
          existingInventory.buyingPrice =
            item.unitLabel === "PACK" && unitToPcs > 1
              ? averageBaseCost * unitToPcs
              : averageBaseCost;
          existingInventory.sellingPrice = Number(item.sellingPrice || 0);
          await existingInventory.save({ session: mongoSession });
        } else {
          const [created] = await OutletInventoryModel.create(
            [
              {
                outletId: transfer.outletId,
                productSource: source,
                productId: productRef,
                productName: item.productName,
                ...classification,
                stockQty: receivedPcs,
                unitLabel: baseUnit,
                unitCode: item.unitLabel === "PACK" ? "PCS" : item.unitCode || baseUnit,
                packSize,
                lowStockAlert: 0,
                companyUnitCost: item.companyUnitCost,
                buyingPrice: transferPrice,
                sellingPrice: item.sellingPrice,
                remarks: "",
                createdBy: user.id,
              },
            ],
            { session: mongoSession }
          );
          inventoryId = created._id;
        }

        await OutletStockTransactionModel.create(
          [
            {
              outletId: transfer.outletId,
              outletInventoryId: inventoryId,
              productSource: source,
              productId: productRef,
              productName: item.productName,
              transactionDate: new Date(),
              type: "DELIVERY_RECEIVED",
              quantity: receivedPcs,
              unitCost: incomingBaseCost,
              entryUnit: item.unitLabel,
              entryQty: receivedQty,
              baseUnit,
              multiplier: unitToPcs,
              previousStock,
              newStock,
              referenceType: "STOCK_TRANSFER",
              referenceId: transfer._id,
              sourceChannel: "FLUTTER",
              remarks: `TRANSFER ${transfer.transferNumber}`,
              createdBy: user.id,
            },
          ],
          { session: mongoSession }
        );
      }

      transfer.totalReceivedQty = totalReceivedQty;
      transfer.totalVarianceQty = totalVarianceQty;
      transfer.hasDiscrepancy = totalVarianceQty > 0;
      if (body?.outletRemarks) transfer.outletRemarks = String(body.outletRemarks).trim();
      await transfer.save({ session: mongoSession });
      await postOutletDelivery(String(transfer._id), mongoSession, user.id);
    });

    return NextResponse.json({ success: true, message: "Delivery confirmed." });
  } catch (error) {
    if (error instanceof OutletDeliveryPostingError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ success: false, message: "Unable to confirm delivery." }, { status: 500 });
  } finally {
    await mongoSession.endSession();
  }
}
