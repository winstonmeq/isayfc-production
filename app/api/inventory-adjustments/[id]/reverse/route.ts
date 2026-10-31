import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { loadInventoryItem, setInventoryQuantity } from "@/lib/inventory-adjustments";
import { reversalQuantity } from "@/lib/adjustment-reversal";
import InventoryAdjustment from "@/models/InventoryAdjustment";

async function handlePOST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { response, session: auth } = await requirePermission("inventory-adjustments.manage");
  if (response) return response;
  const { id } = await context.params;
  const body = await req.json();
  const reason = String(body.reason || "").trim();
  if (!mongoose.isValidObjectId(id) || reason.length < 5 || reason.length > 1000) return NextResponse.json({ success: false, message: "A valid adjustment and reversal reason (5–1000 characters) are required." }, { status: 400 });
  await dbConnect();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const original = await InventoryAdjustment.findById(id).session(session);
      if (!original) throw new Error("Adjustment not found.");
      if (original.status === "REVERSED" || original.reversalOf || original.reversedByAdjustmentId) throw new Error("This adjustment is already reversed or is itself a reversal.");
      const current = await loadInventoryItem(original.inventoryType, original.inventoryId, session);
      const newQty = reversalQuantity(current.qty, original.newQty, original.adjustedQty);
      const date = new Date();
      const [reversal] = await InventoryAdjustment.create([{
        adjustmentNumber: `REV-${randomUUID()}`, adjustmentDate: date,
        inventoryType: original.inventoryType, inventoryId: original.inventoryId,
        productName: original.productName, unit: original.unit,
        previousQty: current.qty, newQty, adjustedQty: -original.adjustedQty,
        reason: "ADJUSTMENT REVERSAL", remarks: reason, reversalOf: original._id,
        createdBy: auth?.user?.id,
      }], { session });
      await setInventoryQuantity({ type: original.inventoryType, id: original.inventoryId, newQty, date,
        reason: `REVERSAL ${original.adjustmentNumber}: ${reason}`, referenceType: "INVENTORY_ADJUSTMENT_REVERSAL",
        referenceId: reversal._id, createdBy: auth?.user?.id, session });
      original.status = "REVERSED";
      original.reversedByAdjustmentId = reversal._id;
      await original.save({ session });
    });
    return NextResponse.json({ success: true, message: "Adjustment reversed. Original record and reversal are retained." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to reverse adjustment." }, { status: 409 });
  } finally { await session.endSession(); }
}
export const POST = withAuditLog(handlePOST, { module: "INVENTORY", action: "REVERSE_ADJUSTMENT", entityType: "INVENTORY_ADJUSTMENT" });
