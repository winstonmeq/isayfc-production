import { mainSaleBalance } from "./main-return-settlement";

export function employeeCreditAmounts(sale: { totalAmount?: number; returnedAmount?: number; paidAmount?: number; refundedAmount?: number }) {
  const credit = Math.round(Math.max(0, Number(sale.totalAmount || 0) - Number(sale.returnedAmount || 0)) * 100) / 100;
  const balance = mainSaleBalance(sale);
  return { credit, paid: Math.round(Math.max(0, credit - balance) * 100) / 100, balance };
}
export function validEmployeeCode(value: string) { return /^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(value); }
export function validCreditDate(value: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "2000-01-01" || value > today) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
