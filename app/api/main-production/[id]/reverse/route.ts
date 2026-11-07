import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requirePermission } from "@/lib/require-permission";
import dbConnect from "@/lib/mongodb";
import { withAuditLog } from "@/lib/audit-log";
import Batch from "@/models/MainProductionBatch";
import Bodega from "@/models/BodegaProduct";
import Product from "@/models/Product";
import Expense from "@/models/Expense";
import BodegaLedger from "@/models/BodegaStockTransaction";
import GroceryLedger from "@/models/InventoryTransaction";

async function post(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { response, session: auth } = await requirePermission("slicing.manage"); if (response) return response;
  const { id } = await context.params;
  const body = await req.json().catch(() => null), reason = String(body?.reason || "").trim();
  if (!mongoose.isValidObjectId(id) || reason.length < 5 || reason.length > 1000) return NextResponse.json({ success: false, message: "Enter a valid batch and reversal reason (5–1000 characters)." }, { status: 400 });
  await dbConnect(); const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const batch = await Batch.findById(id).session(session);
      if (!batch) throw new Error("Batch not found.");
      if (batch.status === "REVERSED") return;
      if (batch.outputType !== "BODEGA" || batch.outputBefore == null || batch.outputPreviousCost == null) throw new Error("Legacy batch lacks reversal snapshots. Use a reviewed inventory/finance correction.");
      if (batch.allocatedExpenses?.length && auth!.user.role !== "ADMIN" && !auth!.user.permissions?.includes("expenses-bodega.manage")) throw new Error("Expense management permission is required to reverse allocated costs.");
      const output = await Bodega.findById(batch.outputProductId).session(session);
      if (!output || output.unitCode !== "KG" || Math.abs(output.stockQty - batch.outputAfter) > 0.000001 || Math.abs(output.stockKilos - output.stockQty) > 0.000001 || Math.abs(output.buyingPrice - batch.weightedCost) > 0.000001) throw new Error("Finished stock has changed. Review downstream transactions before reversal.");
      if (await BodegaLedger.exists({ bodegaProductId: output._id, referenceId: { $ne: batch._id }, createdAt: { $gte: batch.createdAt } }).session(session)) throw new Error("Finished product has subsequent movements. Use a reviewed inventory/finance correction instead of reversing this batch.");
      const now = new Date();
      output.stockQty = batch.outputBefore; output.stockKilos = batch.outputBefore; output.buyingPrice = batch.outputPreviousCost;
      await output.save({ session });
      await BodegaLedger.create([{ bodegaProductId: output._id, transactionDate: now, type: "VOID_REVERSAL", quantity: batch.outputKilos, kilos: batch.outputKilos, kilosDelta: -batch.outputKilos, previousStock: batch.outputAfter, newStock: output.stockQty, referenceType: "MAIN_PRODUCTION_REVERSAL", referenceId: batch._id, remarks: reason, createdBy: auth!.user.id }], { session });
      for (const line of batch.ingredients) {
        const bodega = line.inventoryType === "BODEGA";
        const item = bodega ? await Bodega.findById(line.inventoryId).session(session) : await Product.findById(line.inventoryId).session(session);
        if (!item || !item.isActive) throw new Error("An ingredient is missing/inactive. Review before reversing.");
        const before = Number(item.get(bodega ? "stockQty" : "stockPcs") || 0), multiplier = Number(line.costMultiplier || 1);
        const whole = line.unit === "HEAD";
        const valueQty = whole ? Number(item.get("stockKilos") || 0) : before;
        const incomingQty = whole ? line.kilos : line.quantity;
        const currentCost = Number(item.get("buyingPrice") || 0) / (whole ? 1 : multiplier);
        const restoredCost = (valueQty * currentCost + line.cost) / (valueQty + incomingQty);
        if (!Number.isFinite(restoredCost) || restoredCost < 0) throw new Error("Invalid restored ingredient valuation.");
        item.set("buyingPrice", restoredCost * (whole ? 1 : multiplier));
        item.set(bodega ? "stockQty" : "stockPcs", before + line.quantity);
        if (whole) { item.set("stockHeads", Number(item.get("stockHeads") || 0) + line.quantity); item.set("stockKilos", valueQty + line.kilos); }
        else if (bodega && line.unit === "KG") item.set("stockKilos", before + line.quantity);
        await item.save({ session });
        const common = { transactionDate: now, type: "VOID_REVERSAL" as const, quantity: line.quantity, previousStock: before, newStock: before + line.quantity, referenceType: "MAIN_PRODUCTION_REVERSAL", referenceId: batch._id, remarks: reason, createdBy: auth!.user.id };
        if (bodega) await BodegaLedger.create([{ ...common, bodegaProductId: item._id, heads: whole ? line.quantity : 0, pieces: whole || line.unit === "KG" ? 0 : line.quantity, kilos: whole ? line.kilos : line.unit === "KG" ? line.quantity : 0, kilosDelta: whole ? line.kilos : line.unit === "KG" ? line.quantity : undefined }], { session });
        else await GroceryLedger.create([{ ...common, productId: item._id, unit: "PCS", unitCode: line.unit }], { session });
      }
      for (const expense of batch.allocatedExpenses || []) {
        const result = await Expense.updateOne({ _id: expense.expenseId, capitalizedByBatch: batch._id }, { $set: { capitalizedByBatch: null } }, { session });
        if (result.matchedCount !== 1) throw new Error("An allocated expense changed. Finance review required.");
      }
      batch.status = "REVERSED"; batch.reversedAt = now; batch.reversedBy = auth!.user.id; batch.reversalReason = reason;
      await batch.save({ session });
    });
    return NextResponse.json({ success: true, message: "Batch reversed. Inputs restored and finished output removed; history retained." });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to reverse batch." }, { status: 409 }); }
  finally { await session.endSession(); }
}
export const POST = withAuditLog(post, { module: "PRODUCTION", action: "REVERSE_BATCH", entityType: "MAIN_PRODUCTION" });
