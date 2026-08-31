import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import InventoryAdjustment from "@/models/InventoryAdjustment";
import { loadInventoryItem, setInventoryQuantity, type CountInventoryType } from "@/lib/inventory-adjustments";

export async function GET() {
  const { response } = await requirePermission(["inventory-adjustments.view", "inventory-adjustments.manage"]); if (response) return response;
  await dbConnect(); const data = await InventoryAdjustment.find().populate("createdBy", "name").sort({ adjustmentDate: -1, createdAt: -1 }).limit(1000).lean();
  return NextResponse.json({ success: true, data });
}
async function handlePOST(req: NextRequest) {
  const { response, session } = await requirePermission("inventory-adjustments.manage"); if (response) return response;
  await dbConnect(); const body = await req.json(); const type = String(body.inventoryType || "").toUpperCase() as CountInventoryType;
  const newQty = Number(body.newQty); const reason = String(body.reason || "").trim();
  if (!["BODEGA", "GROCERY", "OUTLET"].includes(type) || !body.inventoryId || !Number.isFinite(newQty) || newQty < 0 || !reason) return NextResponse.json({ success: false, message: "Inventory item, new quantity, and reason are required." }, { status: 400 });
  const mongoSession = await mongoose.startSession(); let saved: any;
  try { await mongoSession.withTransaction(async () => {
    const current = await loadInventoryItem(type, body.inventoryId, mongoSession);
    const adjustmentNumber = `ADJ-${Date.now()}`;
    const [doc] = await InventoryAdjustment.create([{ adjustmentNumber, adjustmentDate: body.adjustmentDate ? new Date(body.adjustmentDate) : new Date(), inventoryType: type, inventoryId: current.item._id, productName: current.name, unit: current.unit, previousQty: current.qty, adjustedQty: newQty - current.qty, newQty, reason, remarks: body.remarks, createdBy: session?.user?.id }], { session: mongoSession });
    await setInventoryQuantity({ type, id: current.item._id, newQty, date: doc.adjustmentDate, reason, referenceType: "INVENTORY_ADJUSTMENT", referenceId: doc._id, createdBy: session?.user?.id, session: mongoSession }); saved = doc;
  }); } finally { await mongoSession.endSession(); }
  return NextResponse.json({ success: true, message: "Inventory adjustment posted.", data: saved }, { status: 201 });
}
export const POST = withAuditLog(handlePOST, { module: "INVENTORY", action: "CREATE_ADJUSTMENT", entityType: "INVENTORY_ADJUSTMENT" });
