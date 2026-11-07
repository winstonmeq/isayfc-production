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

export function canRemoveEmployee(creditBalance: number, unreimbursedAmount: number) {
  const credit = Math.max(0, Math.round((creditBalance || 0) * 100) / 100);
  const unreimbursed = Math.max(0, Math.round((unreimbursedAmount || 0) * 100) / 100);
  if (credit > 0) {
    return {
      canRemove: false,
      reason: `Cannot remove employee with outstanding credit balance of ₱${credit.toFixed(2)}. Settle credit balance first.`,
    };
  }
  if (unreimbursed > 0) {
    return {
      canRemove: false,
      reason: `Cannot remove employee with ₱${unreimbursed.toFixed(2)} in unreimbursed outside purchases. Reimburse employee first.`,
    };
  }
  return { canRemove: true };
}

