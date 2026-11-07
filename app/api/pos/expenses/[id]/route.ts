import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { outletExpenseDay } from "@/lib/business-flow";
import { expenseTypeCode } from "@/lib/expense-types";
import { outletExpenseActions, restoreConsumedStock } from "@/lib/outlet-expense-actions";
import Expense from "@/models/Expense";
import ExpenseType from "@/models/ExpenseType";
import OutletInventory, { type OutletInventoryUnit } from "@/models/OutletInventory";
import OutletStockTransaction from "@/models/OutletStockTransaction";
import CashShift from "@/models/CashShift";
import AuditLog from "@/models/AuditLog";

class ExpenseError extends Error { constructor(public status: number, message: string) { super(message); } }
async function mutate(req: NextRequest, context: { params: Promise<{ id: string }> }, voiding: boolean) {
  const { response, session: auth } = await requirePermission("pos.manage");
  if (response) return response;
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!isValidObjectId(id) || !isValidObjectId(body?.outletId)) return NextResponse.json({ success: false, message: "Select a valid outlet expense." }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 5 || reason.length > 500) return NextResponse.json({ success: false, message: "Enter a correction reason between 5 and 500 characters." }, { status: 400 });
  await dbConnect();
  if (!await findAuthorizedPosOutlet(auth!.user.id, body.outletId)) return NextResponse.json({ success: false, message: "You cannot manage this outlet." }, { status: 403 });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const expense = await Expense.findOne({ _id: id, outletId: body.outletId, expenseCategory: "OUTLET", isActive: true }).session(session);
      if (!expense) throw new ExpenseError(409, "Expense was already voided or is unavailable. Refresh the list.");
      if (!body.expectedUpdatedAt || new Date(body.expectedUpdatedAt).getTime() !== expense.updatedAt.getTime()) throw new ExpenseError(409, "Expense changed since the form opened. Refresh and try again.");
      const actions = outletExpenseActions(expense.origin);
      if (voiding ? !actions.canVoid : !actions.canEdit) throw new ExpenseError(409, "This expense is linked to production. Correct the originating batch; do not change its expense separately.");
      if (expense.shiftId) {
        const shift = await CashShift.findById(expense.shiftId).select("status").session(session).lean();
        if (!shift || shift.status !== "OPEN") throw new ExpenseError(409, "This expense belongs to a finalized cash shift. A finance correction is required.");
      }
      const before = expense.toObject();
      if (voiding) {
        if (expense.origin === "STOCK_USAGE") {
          const inventory = await OutletInventory.findOne({ _id: expense.linkedInventoryId, outletId: expense.outletId, isActive: true }).session(session);
          if (!inventory) throw new ExpenseError(409, "Linked inventory is inactive or missing. Restore the inventory item before voiding usage.");
          let restored: ReturnType<typeof restoreConsumedStock>;
          try { restored = restoreConsumedStock(inventory, { quantity: expense.consumedQuantity, unitCost: expense.consumptionUnitCost, companyAmount: expense.companyAmount }); }
          catch (error) { throw new ExpenseError(409, error instanceof Error ? error.message : "Unable to restore stock safely."); }
          const previousStock = inventory.stockQty;
          Object.assign(inventory, { stockQty: restored.newStock, buyingPrice: restored.buyingPrice, companyUnitCost: restored.companyUnitCost, updatedBy: auth!.user.id });
          await inventory.save({ session });
          const unit = (["HEAD", "PCS", "PACK", "QTY", "KG", "BAG"].includes(expense.consumptionUnit || "") ? expense.consumptionUnit : "QTY") as OutletInventoryUnit;
          await OutletStockTransaction.create([{
            outletId: inventory.outletId, outletInventoryId: inventory._id, productId: inventory.productId,
            productSource: inventory.productSource, productName: inventory.productName, transactionDate: new Date(),
            type: "RETURN", quantity: Number(expense.consumedQuantity), unitCost: Number(expense.consumptionUnitCost),
            previousStock, newStock: inventory.stockQty, entryQty: Number(expense.consumedQuantity),
            entryUnit: unit, baseUnit: unit === "PCS" ? "PCS" : unit === "HEAD" ? "HEAD" : unit === "KG" ? "KG" : "QTY", multiplier: 1,
            referenceType: "STOCK_USAGE_VOID", referenceId: expense._id, sourceChannel: "WEB", remarks: reason, createdBy: auth!.user.id,
          }], { session });
        }
        expense.isActive = false;
      } else {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const date = outletExpenseDay(body.expenseDate), type = expenseTypeCode(body.type);
        if (!name || name.length > 120 || typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0 || !date) throw new ExpenseError(400, "Enter a valid description, positive amount and business date.");
        if (!await ExpenseType.exists({ code: type, isActive: true }).session(session)) throw new ExpenseError(400, "Select an active expense type.");
        expense.name = name; expense.amount = body.amount; expense.type = type; expense.expenseDate = date;
        expense.remarks = typeof body.remarks === "string" ? body.remarks.trim().slice(0, 500) : "";
      }
      await expense.save({ session });
      await AuditLog.create([{
        outletId: expense.outletId, module: "OUTLET EXPENSES", action: voiding ? "VOID" : "UPDATE", entityType: "EXPENSE",
        entityId: expense._id, oldValue: before, newValue: expense.toObject(), remarks: reason, sourceChannel: "WEB", createdBy: auth!.user.id,
      }], { session });
    });
    return NextResponse.json({ success: true, message: voiding ? "Expense voided. Any linked stock usage was restored." : "Expense updated." });
  } catch (error) {
    if (!(error instanceof ExpenseError)) console.error("Outlet expense correction failed", error);
    return NextResponse.json({ success: false, message: error instanceof ExpenseError ? error.message : "Unable to correct expense. No partial changes were saved." }, { status: error instanceof ExpenseError ? error.status : 500 });
  } finally { await session.endSession(); }
}
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(req, context, false); }
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(req, context, true); }
