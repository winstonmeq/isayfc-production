import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { outletExpenseDay } from "@/lib/business-flow";
import { ensureDefaultExpenseTypes } from "@/lib/expense-types";
import { stockConsumptionCost, stockConsumptionType } from "@/lib/stock-consumption";
import OutletInventory from "@/models/OutletInventory";
import OutletStockTransaction from "@/models/OutletStockTransaction";
import Product from "@/models/Product";
import BodegaProduct from "@/models/BodegaProduct";
import Expense from "@/models/Expense";
import AuditLog from "@/models/AuditLog";

class UsageError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function POST(req: NextRequest) {
  const { session: auth, response } = await requirePermission("pos.manage");
  if (response) return response;
  const body = await req.json().catch(() => null);
  const outletId = String(body?.outletId || ""), inventoryId = String(body?.inventoryId || "");
  const key = String(body?.idempotencyKey || "");
  const quantity = body?.quantity;
  const remarks = String(body?.remarks || "").trim().slice(0, 500);
  const expenseDate = outletExpenseDay(body?.expenseDate);
  if (!isValidObjectId(outletId) || !isValidObjectId(inventoryId) || !/^[a-zA-Z0-9-]{16,80}$/.test(key) || typeof quantity !== "number" || !Number.isFinite(quantity) || !expenseDate) return NextResponse.json({ success: false, message: "Select a product, valid quantity and business date." }, { status: 400 });
  await dbConnect();
  if (!await findAuthorizedPosOutlet(auth!.user.id, outletId)) return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 403 });
  await ensureDefaultExpenseTypes();
  const hash = createHash("sha256").update(JSON.stringify({ outletId, inventoryId, quantity, date: expenseDate.toISOString(), remarks })).digest("hex");
  const expenseId = new mongoose.Types.ObjectId(createHash("sha256").update(`stock-usage:${outletId}:${key}`).digest("hex").slice(0, 24));
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const prior = await Expense.findById(expenseId).session(session);
      if (prior) {
        if (!prior.isActive || prior.consumptionRequestHash !== hash) throw new UsageError(409, "This request was already used. Refresh before entering another stock usage.");
        return;
      }
      const item = await OutletInventory.findOne({ _id: inventoryId, outletId, isActive: true }).session(session);
      if (!item) throw new UsageError(404, "Outlet stock is no longer available.");
      if (item.originType && item.originType !== "TRANSFER") throw new UsageError(400, "Only classified ingredient or supply stock can be consumed here.");
      const product = item.productSource === "GROCERY"
        ? await Product.findById(item.productId).select("usage").session(session).lean()
        : await BodegaProduct.findById(item.productId).select("usage").session(session).lean();
      const type = stockConsumptionType(product?.usage);
      if (!type) throw new UsageError(400, "Set this product Usage to Selling Expense or Operating Expense. Production ingredients and overhead belong in Mixing.");
      let cost: ReturnType<typeof stockConsumptionCost>;
      try { cost = stockConsumptionCost(item, quantity); }
      catch (error) { throw new UsageError(400, error instanceof Error ? error.message : "Invalid consumption quantity or cost."); }
      const previousStock = item.stockQty;
      item.stockQty = cost.newStock;
      item.updatedBy = new mongoose.Types.ObjectId(auth!.user.id);
      await item.save({ session });
      const unit = item.packSize > 0 ? "PCS" : item.unitLabel;
      await Expense.create([{
        _id: expenseId, outletId, name: item.productName, type, expenseCategory: "OUTLET", expenseDate,
        amount: cost.amount, companyAmount: cost.companyAmount, origin: "STOCK_USAGE", deductFromCashSale: false,
        expenseNature: "PERIOD_EXPENSE", linkedInventoryId: item._id, consumedQuantity: quantity,
        consumptionUnit: unit, consumptionUnitCost: cost.unitCost, consumptionUsage: product!.usage,
        consumptionRequestHash: hash, remarks, createdBy: auth!.user.id, isActive: true,
      }], { session });
      await OutletStockTransaction.create([{
        outletId, outletInventoryId: item._id, productSource: item.productSource, productId: item.productId,
        productName: item.productName, type: "STOCK_OUT", quantity, unitCost: cost.unitCost,
        transactionDate: new Date(), previousStock, newStock: item.stockQty, entryUnit: unit,
        entryQty: quantity, multiplier: 1, baseUnit: unit === "HEAD" ? "HEAD" : unit === "KG" ? "KG" : unit === "PCS" ? "PCS" : "QTY",
        referenceType: "STOCK_USAGE_EXPENSE", referenceId: expenseId, sourceChannel: "WEB", remarks, createdBy: auth!.user.id,
      }], { session });
      await AuditLog.create([{
        outletId, module: "OUTLET EXPENSES", action: "CREATE", entityType: "STOCK_USAGE_EXPENSE", entityId: expenseId,
        oldValue: { inventoryId, stockQty: previousStock }, newValue: { stockQty: item.stockQty, quantity, amount: cost.amount },
        remarks, sourceChannel: "WEB", createdBy: auth!.user.id,
      }], { session });
    });
    return NextResponse.json({ success: true, message: "Stock usage recorded. Inventory deducted; no cash deduction." });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const prior = await Expense.findById(expenseId).lean();
      if (prior?.isActive && prior.consumptionRequestHash === hash) return NextResponse.json({ success: true, message: "Stock usage already recorded. No duplicate deduction." });
    }
    if (!(error instanceof UsageError)) console.error("Stock consumption failed", error);
    return NextResponse.json({ success: false, message: error instanceof UsageError ? error.message : "Unable to record stock usage. No partial changes saved; refresh and retry." }, { status: error instanceof UsageError ? error.status : 500 });
  } finally { await session.endSession(); }
}
