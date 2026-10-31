import { manilaDateString, startOfDayManila } from "./date-utils";
import { parseExpenseDate } from "./expense-date";

// Product IDs, not names, identify finished menu stock. Legacy menu-ID stock
// remains valid; raw ingredient IDs can never substitute for a menu ID.
export function menuStock<T extends { productId?: unknown }>(inventory: T[], menuId: unknown): T | undefined {
  return inventory.find((row) => String(row.productId) === String(menuId));
}

export function validIngredientQuantity(quantity: number, unit: string) {
  return Number.isFinite(quantity) && quantity > 0 && quantity <= Number.MAX_SAFE_INTEGER &&
    (!["HEAD", "PCS"].includes(unit) || Number.isSafeInteger(quantity));
}

export function outletExpenseDay(value: unknown, now = new Date()): Date | null {
  const day = value === undefined ? manilaDateString(now) : String(value);
  const parsed = parseExpenseDate(day);
  if (!parsed || day > manilaDateString(now)) return null;
  return startOfDayManila(parsed);
}

// Revenue belongs to receipt/recognition day. Old records without a recognition
// timestamp retain their original date; pending receipts never enter reports.
export function recognizedSaleRange(start: Date, end: Date) {
  const date = { $ifNull: ["$recognizedAt", "$saleDate"] };
  return { $and: [{ $gte: [date, start] }, { $lt: [date, end] }] };
}

export function reportOutletDirectory(
  outlets: Array<{ _id: unknown; name?: string; code?: string }>,
  saleOutletIds: string[],
  expenseOutletIds: string[],
) {
  const directory = new Map(outlets.map((outlet) => [String(outlet._id), { ...outlet }]));
  for (const id of [...saleOutletIds, ...expenseOutletIds]) {
    if (!directory.has(id)) directory.set(id, { _id: id, name: id ? "Deleted outlet" : "Unassigned outlet", code: id });
  }
  return [...directory.values()];
}
