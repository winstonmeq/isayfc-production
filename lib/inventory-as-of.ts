import { manilaDateString } from "./date-utils";
import { validCreditDate } from "./employee-credit-policy";

export function inventoryAsOf(value: string | null, now = new Date()) {
  const today = manilaDateString(now), date = value || today;
  if (!validCreditDate(date, today)) throw new Error("Select a valid As of Date, not later than today.");
  const historical = date < today;
  const cutoff = historical ? new Date(new Date(`${date}T00:00:00+08:00`).getTime() + 86400000) : now;
  return { date, historical, cutoff };
}

export function stockBeforeCutoff(current: number, laterMovements: { previousStock?: number; newStock?: number }[]) {
  return Math.round((current - laterMovements.reduce((sum, row) => sum + Number(row.newStock || 0) - Number(row.previousStock || 0), 0)) * 1000000) / 1000000;
}
