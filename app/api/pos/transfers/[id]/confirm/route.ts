import { weightedCompanyCost } from "@/lib/company-cost";
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import { packingSnapshot, toBaseUnitCost } from "@/lib/inventory-units";
import dbConnect from "@/lib/mongodb";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { requirePermission } from "@/lib/require-permission";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import { postOutletDelivery, OutletDeliveryPostingError } from "@/lib/post-outlet-delivery";
import { outletProductClassification } from "@/lib/outlet-product-classification";
import StockTransferModel from "@/models/StockTransfer";
import StockTransferItemModel from "@/models/StockTransferItem";
import AuditLog from "@/models/AuditLog";
import { deliveryDecisionSummary } from "@/lib/delivery-item-decisions";

export const dynamic = "force-dynamic";

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requirePermission("stock-transfers.confirm");
  if (response) return response;
  const { id } = await context.params;
  const body = await req.json().catch(() => null) as null | { outletId?: string; itemId?: string; action?: string; reason?: string };
  const outletId = String(body?.outletId || "");
  const itemId = body?.itemId;
  const reject = body?.action === "REJECT";
  if (itemId && (!isValidObjectId(itemId) || !["ACCEPT", "REJECT"].includes(body?.action || ""))) return NextResponse.json({ success: false, message: "Select a valid product action." }, { status: 400 });
  if (reject && (!itemId || String(body?.reason || "").trim().length < 5)) return NextResponse.json({ success: false, message: "Enter a rejection reason (at least 5 characters)." }, { status: 400 });
  if (!isValidObjectId(id) || !isValidObjectId(outletId)) {
    return NextResponse.json({ success: false, message: "Invalid delivery." }, { status: 400 });
  }
  await dbConnect();
  if (!(await findAuthorizedPosOutlet(session!.user.id, outletId))) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }

  const mongoSession = await mongoose.startSession();
  try {
    let transferNumber = "";
    await mongoSession.withTransaction(async () => {
      const transfer = await StockTransferModel.findOneAndUpdate(
        { _id: id, outletId, status: { $in: ["IN_TRANSIT", "DELIVERED"] } },
        { $set: { updatedAt: new Date() } },
        { new: true, session: mongoSession }
      );
      if (!transfer) throw new ApiError(409, "This delivery is unavailable or was already received.");
      transferNumber = transfer.transferNumber;
      const items = await StockTransferItemModel.find({ transferId: transfer._id }).session(mongoSession);
      const selected = itemId ? items.filter(item => String(item._id) === itemId) : items.filter(item => item.itemStatus === "PENDING");
      if (!selected.length || selected.some(item => item.itemStatus !== "PENDING")) throw new ApiError(409, "This product was already processed. Refresh the list.");
      let receivedTotal = 0;

      for (const item of selected) {
        if (reject) {
          item.receivedQty = 0; item.receivedPcs = 0;
          item.varianceQty = Number(item.baseQty || item.qtyPcs || item.qty);
          item.itemStatus = "REJECTED";
          item.remarks = `REJECTED: ${String(body?.reason || "").trim().slice(0, 500)}`;
          await item.save({ session: mongoSession });
          continue;
        }
        const packSize = Number(item.packSize || 0);
        const multiplier = item.unitLabel === "PACK" && packSize > 0 ? packSize : 1;
        const receivedBaseQty = Number(item.qty || 0) * multiplier;
        const source = item.source === "GROCERY" ? "GROCERY" : "BODEGA";
        const baseUnit = item.baseUnit === "KG" ? "KG" : item.baseUnit === "HEAD" || item.unitLabel === "HEAD" ? "HEAD" : source === "GROCERY" ? "QTY" : "PCS";

        item.receivedQty = item.qty;
        item.receivedPcs = receivedBaseQty;
        item.varianceQty = 0;
        item.itemStatus = "ACCEPTED";
        await item.save({ session: mongoSession });
        receivedTotal += receivedBaseQty;
        if (receivedBaseQty <= 0) continue;

        const productId = source === "GROCERY" ? item.productId : item.bodegaProductId;
        if (!productId) throw new ApiError(400, `${item.productName} has no valid product reference.`);
        const transferPrice = transfer.saleId || Number(item.sellingPrice || 0) > 0 ? Number(item.sellingPrice || 0) : Number(item.buyingPrice || 0);
        const incomingBaseCost = toBaseUnitCost(transferPrice, packingSnapshot({ unit: item.unitLabel, baseUnit, multiplier }));
        const existing = await OutletInventoryModel.findOne({ outletId, productSource: source, productId, isActive: true }).session(mongoSession);
        const classification = await outletProductClassification(source, productId, mongoSession, item.categoryName);

        let inventoryId = existing?._id;
        let previousStock = 0;
        let newStock = receivedBaseQty;
        if (existing) {
          existing.set(classification);
          previousStock = Number(existing.stockQty || 0);
          newStock = previousStock + receivedBaseQty;
          const existingBaseCost = toBaseUnitCost(existing.buyingPrice, packingSnapshot({ unit: Number(existing.packSize || 0) > 0 ? "PACK" : baseUnit, baseUnit, multiplier: existing.packSize }));
          const averageBaseCost = newStock > 0 ? (previousStock * existingBaseCost + receivedBaseQty * incomingBaseCost) / newStock : incomingBaseCost;
          existing.companyUnitCost = weightedCompanyCost(previousStock, existing.companyUnitCost, receivedBaseQty, item.companyUnitCost);
          existing.stockQty = newStock;
          existing.unitLabel = baseUnit;
          existing.packSize = packSize;
          existing.buyingPrice = item.unitLabel === "PACK" && multiplier > 1 ? averageBaseCost * multiplier : averageBaseCost;
          existing.sellingPrice = Number(item.sellingPrice || 0);
          existing.updatedBy = new mongoose.Types.ObjectId(session!.user.id);
          await existing.save({ session: mongoSession });
        } else {
          const [created] = await OutletInventoryModel.create([{
            outletId, productSource: source, productId, productName: item.productName,
            ...classification, stockQty: receivedBaseQty, unitLabel: baseUnit,
            unitCode: item.unitLabel === "PACK" ? "PCS" : item.unitCode || baseUnit,
            companyUnitCost: item.companyUnitCost,
            packSize, buyingPrice: transferPrice, sellingPrice: Number(item.sellingPrice || 0),
            lowStockAlert: 0, createdBy: session!.user.id,
          }], { session: mongoSession });
          inventoryId = created._id;
        }

        await OutletStockTransactionModel.create([{
          outletId, outletInventoryId: inventoryId, productSource: source, productId,
          productName: item.productName, transactionDate: new Date(), type: "DELIVERY_RECEIVED",
          quantity: receivedBaseQty, unitCost: incomingBaseCost, entryUnit: item.unitLabel,
          entryQty: Number(item.qty || 0), baseUnit, multiplier, previousStock, newStock,
          referenceType: "STOCK_TRANSFER", referenceId: transfer._id, sourceChannel: "WEB",
          remarks: `TRANSFER ${transfer.transferNumber}`, createdBy: session!.user.id,
        }], { session: mongoSession });
      }

      const summary = deliveryDecisionSummary(items);
      receivedTotal = summary.received;
      const complete = summary.complete;
      transfer.totalReceivedQty = receivedTotal;
      transfer.totalVarianceQty = summary.variance;
      transfer.hasDiscrepancy = summary.hasDiscrepancy;
      if (complete) {
        transfer.status = "CONFIRMED";
        transfer.confirmedAt = new Date(); transfer.deliveredAt = new Date();
        transfer.confirmedBy = new mongoose.Types.ObjectId(session!.user.id);
      }
      await transfer.save({ session: mongoSession });
      await AuditLog.create([{ outletId, module: "OUTLET DELIVERIES", action: "UPDATE", entityType: "STOCK_TRANSFER", entityId: transfer._id, newValue: { itemIds: selected.map(item => String(item._id)), decision: reject ? "REJECTED" : "ACCEPTED", receivedTotal, hasDiscrepancy: summary.hasDiscrepancy }, remarks: String(body?.reason || "Product receipt accepted"), sourceChannel: "WEB", createdBy: session!.user.id }], { session: mongoSession });

      // A rejected line needs main-branch invoice/physical-return review.
      // Do not recognize the full invoice or automatic expense as if all goods arrived.
      if (complete && !transfer.hasDiscrepancy) await postOutletDelivery(String(transfer._id), mongoSession, session!.user.id);
    });
    return NextResponse.json({ success: true, message: reject ? `Product rejected on ${transferNumber}. Main-branch review is required; main stock was not restored.` : `Product receipt saved for ${transferNumber}. Accepted stock was added once. Any rejected lines require main-branch review before invoice recognition.` });
  } catch (error) {
    if (error instanceof OutletDeliveryPostingError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    if (error instanceof ApiError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ success: false, message: "Unable to receive the delivery." }, { status: 500 });
  } finally {
    await mongoSession.endSession();
  }
}
