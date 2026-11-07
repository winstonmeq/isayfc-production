export const OWNER_DELIVERY_EXPENSE = "OWNER_OUTLET_DELIVERY" as const;

/** Posted selling amounts already include markup and any saved item discount. */
export function ownerDeliverySaleTotals(lines: { source: string; lineTotal: number }[]) {
  const totals = new Map<"BODEGA" | "GROCERY", number>();
  if (!lines.length) throw new Error("The delivery sale has no product lines. Correct it before receipt.");
  for (const line of lines) {
    if (!Number.isFinite(line.lineTotal) || line.lineTotal < 0 || !["CHICKEN", "BODEGA"].includes(line.source)) throw new Error("Invalid main sale line for outlet delivery.");
    const category = line.source === "CHICKEN" ? "BODEGA" : "GROCERY";
    totals.set(category, (totals.get(category) || 0) + Math.round(line.lineTotal * 100));
  }
  return [...totals].map(([expenseCategory, cents]) => ({ expenseCategory, amount: cents / 100 }));
}

export function deliveryExpenseKey(transferId: string, category: string) {
  return `${OWNER_DELIVERY_EXPENSE}:${transferId}:${category}`;
}
