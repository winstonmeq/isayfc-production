import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { validOutletStockCorrection, canRemoveOutletStock } from "@/lib/outlet-inventory-edit";
import OutletInventory from "@/models/OutletInventory";
import OutletStockTransaction from "@/models/OutletStockTransaction";
import OutletMenuItem from "@/models/OutletMenuItem";
import AuditLog from "@/models/AuditLog";

class InventoryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function mutate(req: NextRequest, context: { params: Promise<{ id: string }> }, remove: boolean) {
  const { response, session: auth } = await requirePermission("outlet-inventory.manage");
  if (response) return response;
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!isValidObjectId(id) || !isValidObjectId(body?.outletId)) return NextResponse.json({ success: false, message: "Select a valid outlet inventory item." }, { status: 400 });
  await dbConnect();
  if (!await findAuthorizedPosOutlet(auth!.user.id, body.outletId)) return NextResponse.json({ success: false, message: "You cannot manage this outlet." }, { status: 403 });
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 500) return NextResponse.json({ success: false, message: "Enter a reason between 3 and 500 characters." }, { status: 400 });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const item = await OutletInventory.findOne({ _id: id, outletId: body.outletId, isActive: true }).session(session);
      if (!item) throw new InventoryError(404, "Inventory item no longer exists. Refresh the list.");
      if (typeof body.expectedStock !== "number" || body.expectedStock !== item.stockQty) throw new InventoryError(409, "Stock changed since this form opened. Refresh and try again.");
      const before = item.toObject();
      if (remove) {
        const menuLinked = await OutletMenuItem.exists({ outletId: item.outletId, isActive: true, $or: [
          { _id: item.productId },
          { components: { $elemMatch: { productId: item.productId, productSource: item.productSource } } },
        ] }).session(session);
        if (!canRemoveOutletStock(item.stockQty, Boolean(menuLinked))) throw new InventoryError(409, item.stockQty !== 0 ? "Only zero-stock items can be deleted. Correct or deduct remaining stock first." : "This item is linked to an active menu. Remove the menu link before deleting inventory.");
        item.isActive = false;
      } else {
        if (!validOutletStockCorrection(body.stockQty, item.unitLabel, item.packSize)) throw new InventoryError(400, "Enter a valid non-negative base quantity. Pieces and heads must be whole numbers.");
        const previousStock = item.stockQty;
        item.stockQty = body.stockQty;
        if (item.stockQty !== previousStock) await OutletStockTransaction.create([{
          outletId: item.outletId, outletInventoryId: item._id, productSource: item.productSource,
          productId: item.productId, productName: item.productName, transactionDate: new Date(),
          type: "ADJUSTMENT", quantity: Math.abs(item.stockQty - previousStock), previousStock, newStock: item.stockQty,
          unitCost: item.packSize > 0 ? item.buyingPrice / item.packSize : item.buyingPrice,
          entryUnit: item.packSize > 0 ? "PCS" : item.unitLabel, entryQty: Math.abs(item.stockQty - previousStock),
          baseUnit: item.packSize > 0 ? "PCS" : item.unitLabel === "HEAD" ? "HEAD" : item.unitLabel === "KG" ? "KG" : "QTY",
          multiplier: 1, referenceType: "MANUAL_ADJUSTMENT", sourceChannel: "WEB", remarks: reason, createdBy: auth!.user.id,
        }], { session });
      }
      item.updatedBy = new mongoose.Types.ObjectId(auth!.user.id);
      await item.save({ session });
      await AuditLog.create([{
        outletId: item.outletId, module: "OUTLET INVENTORY", action: remove ? "DELETE" : "UPDATE",
        entityType: "OUTLET_INVENTORY", entityId: item._id, oldValue: before, newValue: item.toObject(),
        remarks: reason, sourceChannel: "WEB", createdBy: auth!.user.id,
      }], { session });
    });
    return NextResponse.json({ success: true, message: remove ? "Inventory item deleted. History retained." : "Inventory correction saved." });
  } catch (error) {
    if (error instanceof InventoryError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("Outlet inventory update failed", error);
    return NextResponse.json({ success: false, message: "Unable to update inventory. No partial changes were saved." }, { status: 500 });
  } finally { await session.endSession(); }
}
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(req, context, false); }
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(req, context, true); }
