import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { validOutletStockCorrection } from "@/lib/outlet-inventory-edit";
import { stockConsumptionCost } from "@/lib/stock-consumption";
import StockControl from "@/models/OutletStockControl";
import Inventory from "@/models/OutletInventory";
import Ledger from "@/models/OutletStockTransaction";
import Expense from "@/models/Expense";
import Sale from "@/models/Sale";
import SaleLine from "@/models/SaleLine";
import AuditLog from "@/models/AuditLog";

class ControlError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function GET(req: NextRequest) {
  const { response, session } = await requirePermission(["pos.view", "pos.manage"]);
  if (response) return response;
  await dbConnect();
  const outletId = req.nextUrl.searchParams.get("outletId") || "";
  if (!await findAuthorizedPosOutlet(session!.user.id, outletId)) return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 403 });
  const rows = await StockControl.find({ outletId }).sort({ createdAt: -1 }).lean();
  const voided = await Expense.find({ _id: { $in: rows.filter(row => row.kind === "SPOILAGE").map(row => row._id) }, isActive: false }).select("_id").lean();
  const reversed = new Set(voided.map(row => String(row._id)));
  return NextResponse.json({ success: true, rows: rows.map(row => ({ ...row, status: reversed.has(String(row._id)) ? "REVERSED" : row.status })) });
}
export async function POST(req: NextRequest) {
  const { response, session: auth } = await requirePermission("outlet-inventory.manage");
  if (response) return response;
  const body = await req.json().catch(() => null);
  const { outletId, inventoryId, kind, quantity, expectedStock, idempotencyKey, saleLineId } = body || {};
  const reason = String(body?.reason || "").trim();
  if (!isValidObjectId(outletId) || !isValidObjectId(inventoryId) || !["CORRECTION", "SPOILAGE", "CUSTOMER_RETURN", "RETURN_TO_MAIN"].includes(kind) || typeof quantity !== "number" || !Number.isFinite(quantity) || reason.length < 5 || reason.length > 500 || !/^[a-zA-Z0-9-]{16,80}$/.test(idempotencyKey || "")) return NextResponse.json({ success: false, message: "Select a product, quantity and reason (5–500 characters)." }, { status: 400 });
  await dbConnect();
  if (!await findAuthorizedPosOutlet(auth!.user.id, outletId)) return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 403 });
  const id = new mongoose.Types.ObjectId(createHash("sha256").update(`outlet-control:${outletId}:${idempotencyKey}`).digest("hex").slice(0, 24));
  const hash = createHash("sha256").update(JSON.stringify({ outletId, inventoryId, kind, quantity, reason, saleLineId })).digest("hex");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const prior = await StockControl.findById(id).session(session);
      if (prior) { if (prior.requestHash !== hash) throw new ControlError(409, "Request already used. Refresh and retry."); return; }
      const item = await Inventory.findOne({ _id: inventoryId, outletId, isActive: true }).session(session);
      if (!item) throw new ControlError(404, "Stock item no longer exists.");
      if (expectedStock !== item.stockQty) throw new ControlError(409, "Stock changed. Refresh before submitting.");
      if (!validOutletStockCorrection(quantity, item.unitLabel, item.packSize) || (kind !== "CORRECTION" && quantity <= 0)) throw new ControlError(400, "Enter a valid base quantity; packed stock uses pieces, not packs.");
      const pending = kind === "CUSTOMER_RETURN" || kind === "RETURN_TO_MAIN";
      if (kind === "CUSTOMER_RETURN") {
        if (!isValidObjectId(saleLineId)) throw new ControlError(400, "Enter the original sale line ID for review.");
        const line = await SaleLine.findOne({ _id: saleLineId, outletInventoryId: item._id }).session(session);
        const sale = line && await Sale.findOne({ _id: line.saleId, outletId, isVoided: false }).session(session);
        if (!sale || !line || quantity > Number(line.baseQty || line.qty)) throw new ControlError(400, "Return must reference this outlet's original sale and cannot exceed its quantity.");
        const existing = await StockControl.exists({ saleLineId, kind, status: "PENDING_REVIEW" }).session(session);
        if (existing) throw new ControlError(409, "This sale line already has a return awaiting review.");
      }
      if (kind === "RETURN_TO_MAIN" && (item.originType && item.originType !== "TRANSFER")) throw new ControlError(400, "Only items received from main can be requested for return to main.");
      if (kind === "RETURN_TO_MAIN" && quantity > item.stockQty) throw new ControlError(400, "Requested return exceeds available stock.");
      const previousStock = item.stockQty;
      let amount = 0;
      let unitCost = item.packSize > 0 ? item.buyingPrice / item.packSize : item.buyingPrice;
      const unit = item.packSize > 0 ? "PCS" : item.unitLabel;
      if (!pending) {
        if (kind === "SPOILAGE") {
          let cost: ReturnType<typeof stockConsumptionCost>;
          try { cost = stockConsumptionCost(item, quantity); }
          catch (error) { throw new ControlError(400, error instanceof Error ? error.message : "Invalid stock quantity or cost."); }
          unitCost = cost.unitCost; amount = cost.amount; item.stockQty = cost.newStock;
          await Expense.create([{ _id: id, outletId, name: `Spoilage: ${item.productName}`, type: "SPOILAGE_LOSS", expenseCategory: "OUTLET", expenseDate: new Date(), amount, companyAmount: cost.companyAmount, origin: "STOCK_USAGE", linkedInventoryId: item._id, consumedQuantity: quantity, consumptionUnit: unit, consumptionUnitCost: unitCost, consumptionUsage: "SPOILAGE", deductFromCashSale: false, expenseNature: "PERIOD_EXPENSE", remarks: reason, createdBy: auth!.user.id }], { session });
        } else item.stockQty = quantity;
        if (previousStock === item.stockQty) throw new ControlError(400, "New quantity is unchanged.");
        item.updatedBy = new mongoose.Types.ObjectId(auth!.user.id);
        await item.save({ session });
        await Ledger.create([{ outletId, outletInventoryId: item._id, productId: item.productId, productSource: item.productSource, productName: item.productName, transactionDate: new Date(), type: kind === "SPOILAGE" ? "STOCK_OUT" : "ADJUSTMENT", quantity: Math.abs(previousStock - item.stockQty), previousStock, newStock: item.stockQty, unitCost, entryUnit: unit, entryQty: Math.abs(previousStock - item.stockQty), baseUnit: unit === "HEAD" ? "HEAD" : unit === "PCS" ? "PCS" : unit === "KG" ? "KG" : "QTY", multiplier: 1, referenceType: kind === "SPOILAGE" ? "STOCK_USAGE_EXPENSE" : "STOCK_CORRECTION", referenceId: id, sourceChannel: "WEB", remarks: reason, createdBy: auth!.user.id }], { session });
      }
      await StockControl.create([{ _id: id, outletId, inventoryId, productName: item.productName, kind, status: pending ? "PENDING_REVIEW" : "POSTED", quantity, previousStock, newStock: item.stockQty, unit, unitCost, amount, reason, saleLineId: kind === "CUSTOMER_RETURN" ? saleLineId : undefined, requestHash: hash, createdBy: auth!.user.id }], { session });
      await AuditLog.create([{ outletId, module: "OUTLET STOCK CONTROL", action: "CREATE", entityType: "OUTLET_STOCK_CONTROL", entityId: id, remarks: reason, newValue: { kind, quantity, previousStock, newStock: item.stockQty }, sourceChannel: "WEB", createdBy: auth!.user.id }], { session });
    });
    return NextResponse.json({ success: true, message: ["CUSTOMER_RETURN", "RETURN_TO_MAIN"].includes(kind) ? "Request saved for review. No stock, refund or main receipt has been posted." : "Stock updated and ledger recorded." });
  } catch (error) {
    if (!(error instanceof ControlError)) console.error("Outlet stock control failed", error);
    return NextResponse.json({ success: false, message: error instanceof ControlError ? error.message : "Unable to save. No partial changes saved; refresh and retry." }, { status: error instanceof ControlError ? error.status : 500 });
  } finally { await session.endSession(); }
}
