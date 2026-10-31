export function moneyAmount(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") throw new Error("Enter a valid amount.");
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) throw new Error("Enter a positive amount with at most two decimal places.");
  return Math.round(amount * 100) / 100;
}

export function remainingAmount(total: number, paid: number, payment: number) {
  const remaining = Math.round((total - paid) * 100) / 100;
  if (payment > remaining) throw new Error("Payment exceeds the outstanding balance.");
  return Math.round((remaining - payment) * 100) / 100;
}

export function outletCashSummary(cashSales: number, collections: number, expenses: number, reimbursements: number) {
  return { cashSales, collections, expenses, reimbursements, netCashMovement: Math.round((cashSales + collections - expenses - reimbursements) * 100) / 100 };
}
