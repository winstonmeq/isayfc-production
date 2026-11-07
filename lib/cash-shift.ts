// lib/cash-shift.ts
import { Types, type ClientSession } from "mongoose";

import SaleModel from "@/models/Sale";
import ExpenseModel from "@/models/Expense";

/**
 * Match a shift either by the first-class `shiftId` field (current writes,
 * indexed) or by the legacy `SHIFT:<id>` remarks tag (rows written before
 * shiftId existed). The tag is anchored to the 24-char id so a shorter id
 * can't substring-match a longer one.
 */
function shiftMatch(shiftId: string) {
  const or: Record<string, unknown>[] = [
    { remarks: { $regex: `SHIFT:${shiftId}(\\b|$)` } },
  ];
  if (Types.ObjectId.isValid(shiftId)) {
    or.unshift({ shiftId: new Types.ObjectId(shiftId) });
  }
  return { $or: or };
}

/** Sum the (non-voided, cash) sales belonging to a given shift. */
export async function sumShiftSales(
  shiftId: string,
  session?: ClientSession
) {
  const query = SaleModel.find({
    ...shiftMatch(shiftId),
    // Only cash counts toward the drawer. Legacy rows have no paymentMethod
    // (undefined) and were all cash, so accept CASH or unset; exclude GCASH
    // and CREDIT once those start being written.
    paymentMethod: { $in: ["CASH", null] },
    isVoided: { $ne: true },
  }).select("totalAmount");
  if (session) query.session(session);
  const sales = await query.lean();

  let total = 0;
  for (const s of sales as Array<{ totalAmount?: number }>) {
    total += Number(s.totalAmount || 0);
  }
  return { total, count: sales.length };
}

/** Sum the active expenses belonging to a given shift. Only cash sale expenses (deductFromCashSale !== false) reduce cash drawer. */
export async function sumShiftExpenses(
  shiftId: string,
  session?: ClientSession
) {
  const query = ExpenseModel.find({
    isActive: true,
    deductFromCashSale: { $ne: false },
    ...shiftMatch(shiftId),
  }).select("amount");
  if (session) query.session(session);
  const expenses = await query.lean();

  let total = 0;
  for (const e of expenses as Array<{ amount?: number }>) {
    total += Number(e.amount || 0);
  }
  return { total, count: expenses.length };
}
