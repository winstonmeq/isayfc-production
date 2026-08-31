import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import StockCount from "@/models/StockCount";
import { loadInventoryItem, type CountInventoryType } from "@/lib/inventory-adjustments";

export async function GET() {
  const { response } = await requirePermission(["stock-counts.view", "stock-counts.manage"]); if (response) return response;
  await dbConnect();
  const data = await StockCount.find().populate("createdBy", "name").sort({ countDate: -1, createdAt: -1 }).limit(500).lean();
  return NextResponse.json({ success: true, data });
}

async function handlePOST(req: NextRequest) {
  const { response, session } = await requirePermission("stock-counts.manage"); if (response) return response;
  await dbConnect(); const body = await req.json();
  if (!Array.isArray(body.items) || !body.items.length) return NextResponse.json({ success: false, message: "Add at least one counted item." }, { status: 400 });
  const items = [];
  for (const input of body.items) {
    const type = String(input.inventoryType || "").toUpperCase() as CountInventoryType;
    if (!["BODEGA", "GROCERY", "OUTLET"].includes(type)) return NextResponse.json({ success: false, message: "Invalid inventory type." }, { status: 400 });
    const countedQty = Number(input.countedQty);
    if (!Number.isFinite(countedQty) || countedQty < 0) return NextResponse.json({ success: false, message: "Counted quantity must be zero or greater." }, { status: 400 });
    const current = await loadInventoryItem(type, input.inventoryId);
    items.push({ inventoryType: type, inventoryId: current.item._id, productName: current.name, unit: current.unit, systemQty: current.qty, countedQty, variance: countedQty - current.qty });
  }
  const countNumber = `SC-${Date.now()}`;
  const doc = await StockCount.create({ countNumber, countDate: body.countDate ? new Date(body.countDate) : new Date(), remarks: body.remarks, items, createdBy: session?.user?.id });
  return NextResponse.json({ success: true, message: "Stock count saved as draft.", data: doc }, { status: 201 });
}
export const POST = withAuditLog(handlePOST, { module: "INVENTORY", action: "CREATE_STOCK_COUNT", entityType: "STOCK_COUNT" });
