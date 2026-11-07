import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { createHash, randomUUID } from "node:crypto";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { loadInventoryItem } from "@/lib/inventory-adjustments";
import { productQuantityAllowed } from "@/lib/product-units";
import { mainProductionCost } from "@/lib/main-production-cost";
import { manilaDateString, startOfDayManila } from "@/lib/date-utils";
import Batch from "@/models/MainProductionBatch";
import Product from "@/models/Product";
import Bodega from "@/models/BodegaProduct";
import StandardPacking from "@/models/StandardPacking";
import GroceryLedger from "@/models/InventoryTransaction";
import BodegaLedger from "@/models/BodegaStockTransaction";
import Expense from "@/models/Expense";

export async function GET() {
  const { response, session: auth } = await requirePermission(["slicing.view", "slicing.manage"]); if (response) return response;
  await dbConnect();
  const batches = await Batch.find().sort({ productionDate: -1, createdAt: -1 }).limit(1000).populate("createdBy", "name").lean();
  const products = await Product.find({ isActive: true }).select("name unitCode stockPcs buyingPrice").sort({ name: 1 }).lean();
  const bodega = await Bodega.find({ isActive: true }).select("name unitCode stockQty stockHeads stockKilos buyingPrice").sort({ name: 1 }).lean();
  const standards = await StandardPacking.find({ isActive: true }).select("wholeChickenId productId standardPacking").lean();
  const ingredients = [
    ...products.map(p => ({ id: String(p._id), type: "GROCERY", name: p.name, unit: p.unitCode || "PCS", quantity: p.stockPcs, whole: false, kilos: 0 })),
    ...bodega.map(p => ({ id: String(p._id), type: "BODEGA", name: p.name, unit: p.unitCode === "KG" ? "KG" : "PCS", quantity: p.stockQty, whole: p.unitCode !== "KG" && (p.unitCode === "HEAD" || standards.some(s => String(s.wholeChickenId) === String(p._id))), kilos: p.stockKilos })),
  ];
  const expenses = auth?.user.role === "ADMIN" || auth?.user.permissions?.includes("expenses-bodega.manage") ? await Expense.find({ isActive: true, outletId: null, expenseCategory: { $ne: "OUTLET" }, origin: "MANUAL", capitalizedByBatch: null }).select("name amount expenseDate").sort({ expenseDate: -1 }).limit(500).lean() : [];
  return NextResponse.json({ success: true, batches, ingredients, expenses, outputs: bodega.filter(p => p.unitCode === "KG").map(p => ({ id: String(p._id), name: p.name })) });
}

async function post(req: NextRequest) {
  const { response, session: auth } = await requirePermission("slicing.manage"); if (response) return response;
  const body = await req.json().catch(() => null);
  if (!body || !mongoose.isValidObjectId(body.outputProductId) || !/^[a-zA-Z0-9-]{16,80}$/.test(body.requestKey || "") || !Array.isArray(body.ingredients) || !body.ingredients.length || body.ingredients.length > 200) return NextResponse.json({ success: false, message: "Select an output product and ingredients." }, { status: 400 });
  const day = String(body.productionDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > manilaDateString() || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) return NextResponse.json({ success: false, message: "Enter a valid production date, not in the future." }, { status: 400 });
  const expenseIds = Array.isArray(body.expenseIds) ? body.expenseIds : [];
  if (expenseIds.length > 50 || expenseIds.some((id: string) => !mongoose.isValidObjectId(id)) || new Set(expenseIds).size !== expenseIds.length) return NextResponse.json({ success: false, message: "Select valid unique production-cost expenses." }, { status: 400 });
  if (expenseIds.length && auth!.user.role !== "ADMIN" && !auth!.user.permissions?.includes("expenses-bodega.manage")) return NextResponse.json({ success: false, message: "Expense management permission is required to allocate expenses." }, { status: 403 });
  const hash = createHash("sha256").update(JSON.stringify({ outputProductId: body.outputProductId, outputKilos: body.outputKilos, productionDate: day, ingredients: body.ingredients, expenseIds, remarks: body.remarks || "" })).digest("hex");
  await dbConnect();
  await Batch.init();
  const session = await mongoose.startSession();
  try {
    let saved;
    await session.withTransaction(async () => {
      const previous = await Batch.findOne({ requestKey: body.requestKey }).session(session);
      if (previous) { if (previous.payloadHash !== hash) throw new Error("This request was already posted with different details. Refresh before another batch."); saved = previous; return; }
      const output = await Bodega.findOne({ _id: body.outputProductId, isActive: true, unitCode: "KG" }).session(session);
      if (!output) throw new Error("Create/select a Bodega finished product with KG unit, such as Letson.");
      const snapshots = [];
      const seen = new Set<string>();
      const batchId = new mongoose.Types.ObjectId();
      const date = startOfDayManila(new Date(`${day}T00:00:00+08:00`));
      const remarks = String(body.remarks || "").trim().slice(0, 1000);
      const allocatedExpenses = [];
      for (const expenseId of expenseIds) {
        const expense = await Expense.findOneAndUpdate({ _id: expenseId, isActive: true, outletId: null, expenseCategory: { $ne: "OUTLET" }, origin: "MANUAL", capitalizedByBatch: null }, { $set: { capitalizedByBatch: batchId } }, { new: true, session });
        if (!expense || !Number.isFinite(expense.amount) || expense.amount <= 0) throw new Error("An expense is unavailable, already allocated, or has an invalid amount.");
        if (manilaDateString(expense.expenseDate) !== day) throw new Error("Allocate costs on the same business date as production. Prior-period costs require finance review.");
        allocatedExpenses.push({ expenseId: expense._id, name: expense.name, amount: expense.amount });
      }
      for (const row of body.ingredients) {
        if (!["BODEGA", "GROCERY"].includes(row.type) || !mongoose.isValidObjectId(row.id)) throw new Error("Invalid ingredient.");
        const key = `${row.type}:${row.id}`;
        if (seen.has(key)) throw new Error("Each ingredient may appear only once per batch."); seen.add(key);
        if (row.type === "BODEGA" && String(output._id) === row.id) throw new Error("Output product cannot be its own ingredient.");
        const current = await loadInventoryItem(row.type, row.id, session);
        if (["SELLING_EXPENSE", "OPERATING_EXPENSE"].includes(current.item.usage)) throw new Error(`${current.name}: operating/selling supplies are not production ingredients. Use Business Expenses for their consumption.`);
        const quantity = Number(row.quantity), kilos = current.whole ? Number(row.kilos) : 0;
        if (!Number.isFinite(quantity) || quantity <= 0 || !await productQuantityAllowed(current.unit, quantity) || quantity > current.qty) throw new Error(`${current.name}: invalid quantity or insufficient stock.`);
        if (current.whole && (!Number.isFinite(kilos) || kilos <= 0 || kilos > current.kilos || Number(current.item.stockHeads) < quantity)) throw new Error(`${current.name}: enter available heads and actual kilos.`);
        if (current.whole && ((current.qty - quantity === 0) !== (Math.abs(current.kilos - kilos) < 0.000001))) throw new Error(`${current.name}: consuming all heads must also consume their remaining kilos, and vice versa.`);
        let unitCost = Number(current.item.buyingPrice);
        let costMultiplier = 1;
        if (row.type === "BODEGA" && !current.whole && current.unit !== "KG") {
          const standards = await StandardPacking.find({ productId: current.item._id, isActive: true, standardPacking: { $gt: 0 } }).session(session);
          const sizes = [...new Set(standards.map(s => s.standardPacking))];
          if (sizes.length > 1) throw new Error(`${current.name}: resolve multiple pack sizes before production costing.`);
          if (sizes.length === 1) { costMultiplier = sizes[0]; unitCost /= costMultiplier; }
          else if (current.item.unitCode === "PACK") throw new Error(`${current.name}: configure its packing standard first.`);
        }
        if (!Number.isFinite(unitCost) || unitCost <= 0) throw new Error(`${current.name}: set a positive buying cost before production.`);
        const cost = (current.whole ? kilos : quantity) * unitCost;
        snapshots.push({ inventoryType: row.type, inventoryId: current.item._id, productName: current.name, unit: current.unit, quantity, kilos, unitCost, costMultiplier, cost, previousQty: current.qty, newQty: current.qty - quantity, ...(current.whole ? { previousKilos: current.kilos, newKilos: current.kilos - kilos } : {}) });
        if (row.type === "BODEGA") {
          current.item.stockQty -= quantity;
          if (current.whole) { current.item.stockHeads -= quantity; current.item.stockKilos -= kilos; }
          else if (current.unit === "KG") current.item.stockKilos = current.item.stockQty;
          await current.item.save({ session });
          await BodegaLedger.create([{ bodegaProductId: current.item._id, transactionDate: date, type: "STOCK_OUT", quantity, heads: current.whole ? quantity : 0, kilos, kilosDelta: current.whole ? -kilos : undefined, pieces: current.whole ? 0 : quantity, previousStock: current.qty, newStock: current.qty - quantity, referenceType: "MAIN_PRODUCTION", referenceId: batchId, createdBy: auth!.user.id, remarks }], { session });
        } else {
          current.item.stockPcs -= quantity; await current.item.save({ session });
          await GroceryLedger.create([{ productId: current.item._id, transactionDate: date, type: "STOCK_OUT", unit: "PCS", unitCode: current.unit, quantity, previousStock: current.qty, newStock: current.qty - quantity, referenceType: "MAIN_PRODUCTION", referenceId: batchId, createdBy: auth!.user.id, remarks }], { session });
        }
      }
      const outputKilos = Number(body.outputKilos);
      const costing = mainProductionCost([...snapshots.map(s => ({ quantity: s.quantity, kilos: s.kilos, whole: s.unit === "HEAD", unitCost: s.unitCost })), ...allocatedExpenses.map(e => ({ quantity: 1, whole: false, unitCost: e.amount }))], outputKilos, Number(output.stockQty || 0), Number(output.buyingPrice || 0));
      const before = Number(output.stockQty || 0), beforeCost = Number(output.buyingPrice || 0);
      output.stockQty = before + outputKilos; output.stockKilos = output.stockQty; output.buyingPrice = costing.weightedCost;
      await output.save({ session });
      await BodegaLedger.create([{ bodegaProductId: output._id, transactionDate: date, type: "STOCK_IN", quantity: outputKilos, kilos: outputKilos, kilosDelta: outputKilos, previousStock: before, newStock: output.stockQty, referenceType: "MAIN_PRODUCTION", referenceId: batchId, createdBy: auth!.user.id, remarks }], { session });
      [saved] = await Batch.create([{ _id: batchId, requestKey: body.requestKey, payloadHash: hash, batchNumber: `PROD-${randomUUID().slice(0, 8).toUpperCase()}`, productionDate: date, outputType: "BODEGA", outputProductId: output._id, outputName: output.name, outputKilos, outputBefore: before, outputAfter: output.stockQty, outputPreviousCost: beforeCost, totalCost: costing.totalCost, costPerKilo: costing.costPerKilo, weightedCost: costing.weightedCost, ingredients: snapshots, allocatedExpenses, remarks, createdBy: auth!.user.id }], { session });
    });
    return NextResponse.json({ success: true, message: "Production posted. Inputs deducted and finished kilos added.", data: saved });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to post batch." }, { status: 409 }); }
  finally { await session.endSession(); }
}
export const POST = withAuditLog(post, { module: "PRODUCTION", action: "POST_BATCH", entityType: "MAIN_PRODUCTION" });
