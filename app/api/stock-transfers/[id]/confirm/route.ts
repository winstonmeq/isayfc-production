import { weightedCompanyCost } from "@/lib/company-cost";
// app/api/stock-transfers/[id]/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanString } from "@/lib/crud-utils";
import { StockTransferError, transferFail } from "@/lib/stock-transfers";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import StockTransferModel from "@/models/StockTransfer";
import StockTransferItemModel from "@/models/StockTransferItem";
import { postOutletDelivery, OutletDeliveryPostingError } from "@/lib/post-outlet-delivery";
import { outletProductClassification } from "@/lib/outlet-product-classification";
import { packingSnapshot, toBaseUnitCost } from "@/lib/inventory-units";

export const dynamic = "force-dynamic";

type ConfirmItemInput = {
  itemId?: string;
  receivedQty?: number;
  remarks?: string;
};

async function handlePOST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission(
    "stock-transfers.confirm"
  );
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid transfer ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  let body: { items?: ConfirmItemInput[]; outletRemarks?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body." },
      { status: 400 }
    );
  }

  const itemsInput: ConfirmItemInput[] = Array.isArray(body?.items)
    ? body.items
    : [];
  const outletRemarks = cleanString(body?.outletRemarks);

  const mongoSession = await mongoose.startSession();

  try {
    let transferNumber = "";
    let hasDiscrepancy = false;

    await mongoSession.withTransaction(async () => {
      // Atomically claim so two staff members cannot both confirm.
      const transfer = await StockTransferModel.findOneAndUpdate(
        { _id: id, status: { $in: ["IN_TRANSIT", "DELIVERED"] } },
        {
          $set: {
            status: "CONFIRMED",
            confirmedAt: new Date(),
            confirmedBy: session?.user?.id,
            deliveredAt: new Date(),
          },
        },
        { new: true, session: mongoSession }
      );

      if (!transfer) {
        const existing = await StockTransferModel.findById(id)
          .select("status")
          .session(mongoSession)
          .lean();

        if (!existing) {
          transferFail(404, "Stock transfer not found.");
        }

        transferFail(
          400,
          existing.status === "CONFIRMED"
            ? "This transfer is already confirmed."
            : existing.status === "DRAFT"
              ? "This transfer has not been dispatched yet."
              : "This transfer is cancelled."
        );
      }

      transferNumber = transfer.transferNumber;

      const items = await StockTransferItemModel.find({
        transferId: transfer._id,
      }).session(mongoSession);
      if (items.some(item => item.itemStatus !== "PENDING")) transferFail(409, "This delivery has product-level decisions. Complete it in the outlet Receive Deliveries page.");

      // Every line must be counted explicitly — no silent assumptions.
      const inputByItemId = new Map<string, ConfirmItemInput>();

      for (const input of itemsInput) {
        const itemId = cleanString(input?.itemId);

        if (!isValidObjectId(itemId)) {
          transferFail(400, "Invalid item in confirmation.");
        }

        inputByItemId.set(itemId, input);
      }

      let totalReceivedQty = 0;
      let totalVarianceQty = 0;

      for (const item of items) {
        const input = inputByItemId.get(item._id.toString());

        if (!input) {
          transferFail(
            400,
            `Please provide the received quantity for ${item.productName}.`
          );
        }

        const receivedQty = Math.trunc(Number(input.receivedQty));
        const itemRemarks = cleanString(input.remarks);

        if (!Number.isFinite(receivedQty) || receivedQty < 0) {
          transferFail(
            400,
            `Received quantity for ${item.productName} must be 0 or more.`
          );
        }

        if (receivedQty > item.qty) {
          transferFail(
            400,
            `Received quantity for ${item.productName} (${receivedQty}) cannot exceed the dispatched quantity (${item.qty}).`
          );
        }

        const varianceQty = item.qty - receivedQty;

        if (transfer.saleId && varianceQty > 0) {
          transferFail(
            400,
            `Outlet-sale transfer ${transfer.transferNumber} must be received in full before revenue is recognized. Ask the main branch to correct or cancel the transfer for ${item.productName}.`
          );
        }

        if (varianceQty > 0 && !itemRemarks) {
          transferFail(
            400,
            `Please add a remark explaining the discrepancy on ${item.productName} (${varianceQty} short or rejected).`
          );
        }

        const packSize = Number(item.packSize || 0);
        const unitToPcs = item.unitLabel === "PACK" && packSize > 0 ? packSize : 1;
        const source = item.source === "GROCERY" ? "GROCERY" : "BODEGA";

        const receivedPcs = receivedQty * unitToPcs;
        const variancePcs = (item.qty - receivedQty) * unitToPcs;
        const baseUnit =
          item.baseUnit === "KG" ? "KG" : item.baseUnit === "HEAD" || item.unitLabel === "HEAD"
            ? "HEAD"
            : source === "GROCERY"
              ? "QTY"
              : "PCS";

        item.receivedQty = receivedQty;
        item.receivedPcs = receivedPcs;
        item.varianceQty = varianceQty;
        item.itemStatus =
          receivedQty === 0
            ? "REJECTED"
            : varianceQty > 0
              ? "PARTIAL"
              : "ACCEPTED";
        item.remarks = itemRemarks;

        await item.save({ session: mongoSession });

        // Tally in base units (pcs) so the transfer totals reconcile with stock.
        totalReceivedQty += receivedPcs;
        totalVarianceQty += variancePcs;

        if (receivedPcs <= 0) continue;

        const productRef =
          source === "GROCERY" ? item.productId : item.bodegaProductId;

        // The main branch charges its marked-up selling price to the outlet.
        // Keep stock in base units, but carry that transfer price into outlet
        // inventory so mixing and POS COGS use the outlet's true acquisition
        // cost instead of the main branch's supplier cost.
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
          {
            outletId: transfer.outletId,
            productSource: source,
            productId: productRef,
            isActive: true,
          }
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
                createdBy: session?.user?.id,
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
              sourceChannel: "WEB",
              remarks: `TRANSFER ${transfer.transferNumber}`,
              createdBy: session?.user?.id,
            },
          ],
          { session: mongoSession }
        );
      }

      hasDiscrepancy = totalVarianceQty > 0;

      transfer.totalReceivedQty = totalReceivedQty;
      transfer.totalVarianceQty = totalVarianceQty;
      transfer.hasDiscrepancy = hasDiscrepancy;
      transfer.outletRemarks = outletRemarks;

      await transfer.save({ session: mongoSession });

      await postOutletDelivery(String(transfer._id), mongoSession, session?.user?.id);
    });

    return NextResponse.json({
      success: true,
      message: hasDiscrepancy
        ? `Transfer ${transferNumber} confirmed with discrepancies. The main branch can review the variance report.`
        : `Transfer ${transferNumber} confirmed. Outlet inventory has been updated.`,
    });
  } catch (error) {
    if (error instanceof OutletDeliveryPostingError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    if (error instanceof StockTransferError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error(error);

    return NextResponse.json(
      { success: false, message: "Unable to confirm stock transfer." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}

export const POST = withAuditLog(handlePOST, {
  module: "STOCK_TRANSFERS",
  action: "CONFIRM",
  entityType: "STOCK_TRANSFER",
});
