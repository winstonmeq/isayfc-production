import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import StockCount from "@/models/StockCount";
import InventoryAdjustment from "@/models/InventoryAdjustment";
import { setInventoryQuantity } from "@/lib/inventory-adjustments";

async function handlePOST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { response, session } = await requirePermission("stock-counts.manage"); if (response) return response;
  const { id } = await ctx.params; if (!isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid count ID." }, { status: 400 });
  await dbConnect(); const mongoSession = await mongoose.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      const count: any = await StockCount.findById(id).session(mongoSession);
      if (!count || count.status !== "DRAFT") throw new Error("Only a draft stock count can be posted.");
      const adjustments = [];
      for (const row of count.items) {
        const result = await setInventoryQuantity({ type: row.inventoryType, id: row.inventoryId, newQty: row.countedQty, date: count.countDate, reason: `PHYSICAL COUNT ${count.countNumber}`, referenceType: "STOCK_COUNT", referenceId: count._id, createdBy: session?.user?.id, session: mongoSession });
        row.systemQty = result.previousQty; row.variance = result.difference;
        if (result.difference !== 0) adjustments.push({ adjustmentNumber: `ADJ-${count.countNumber}-${adjustments.length + 1}`, adjustmentDate: count.countDate, inventoryType: row.inventoryType, inventoryId: row.inventoryId, productName: row.productName, unit: row.unit, previousQty: result.previousQty, adjustedQty: result.difference, newQty: row.countedQty, reason: "PHYSICAL COUNT CORRECTION", stockCountId: count._id, createdBy: session?.user?.id });
      }
      if (adjustments.length) await InventoryAdjustment.insertMany(adjustments, { session: mongoSession });
      count.status = "POSTED"; count.postedBy = session?.user?.id; count.postedAt = new Date(); await count.save({ session: mongoSession });
    });
  } finally { await mongoSession.endSession(); }
  return NextResponse.json({ success: true, message: "Stock count posted and inventory adjusted." });
}
export const POST = withAuditLog(handlePOST, { module: "INVENTORY", action: "POST_STOCK_COUNT", entityType: "STOCK_COUNT" });
