export type DiscountBasis = "PER_UNIT" | "PER_ROW";
export type DiscountRule = { name: string; type: "PERCENTAGE" | "AMOUNT"; value: number; basis?: DiscountBasis };

export function validateDiscountRule(rule: DiscountRule) {
  if (!rule.name.trim() || rule.name.trim().length > 100) throw new Error("Enter a discount name of 1 to 100 characters.");
  if (rule.type !== "PERCENTAGE" && rule.type !== "AMOUNT") throw new Error("Select percentage or amount.");
  if (rule.basis !== undefined && rule.basis !== "PER_UNIT" && rule.basis !== "PER_ROW") throw new Error("Select per unit or per product row.");
  if (!Number.isFinite(rule.value) || rule.value <= 0 || !Number.isSafeInteger(Math.round(rule.value * 100)) || Math.abs(rule.value * 100 - Math.round(rule.value * 100)) > 0.000001) {
    throw new Error("Enter a positive discount with at most two decimal places.");
  }
  if (rule.type === "PERCENTAGE" && rule.value > 100) throw new Error("Percentage cannot exceed 100%.");
}

/** Allocate cents by largest remainder so line totals exactly match the invoice. */
export function applySaleDiscount(grossLines: number[], rule?: DiscountRule | null) {
  const cents = grossLines.map((amount) => {
    if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100))) throw new Error("Invalid sale amount.");
    return Math.round(amount * 100);
  });
  const subtotalCents = cents.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isSafeInteger(subtotalCents)) throw new Error("Sale amount is too large.");
  if (rule) validateDiscountRule(rule);
  const discountCents = !rule ? 0 : rule.type === "PERCENTAGE"
    ? Math.round(subtotalCents * rule.value / 100)
    : Math.round(rule.value * 100);
  if (discountCents > subtotalCents) throw new Error("The selected discount exceeds the sale subtotal.");
  const shares = cents.map((amount, index) => {
    const exact = subtotalCents > 0 ? discountCents * amount / subtotalCents : 0;
    return { index, amount: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = discountCents - shares.reduce((sum, share) => sum + share.amount, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining <= 0) break;
    if (share.amount < cents[share.index]) { share.amount++; remaining--; }
  }
  return {
    subtotal: subtotalCents / 100,
    discountAmount: discountCents / 100,
    totalAmount: (subtotalCents - discountCents) / 100,
    lines: cents.map((amount, index) => ({ grossLineTotal: amount / 100, discountAmount: shares[index].amount / 100, lineTotal: (amount - shares[index].amount) / 100 })),
  };
}

/** Missing basis preserves existing row discounts; unit amounts use the sale quantity. */
export function applyItemDiscounts(items: { subtotal: number; quantity?: number; discount?: DiscountRule | null }[]) {
  const lines = items.map((item) => {
    const rule = item.discount;
    if (!rule || rule.type !== "AMOUNT" || rule.basis !== "PER_UNIT") {
      return applySaleDiscount([item.subtotal], rule).lines[0];
    }
    validateDiscountRule(rule);
    if (!Number.isFinite(item.quantity) || Number(item.quantity) <= 0) throw new Error("Enter a valid product quantity for the per-unit discount.");
    const amountCents = Math.round(rule.value * 100 * Number(item.quantity));
    if (!Number.isSafeInteger(amountCents)) throw new Error("Discount amount is too large.");
    const grossCents = Math.round(item.subtotal * 100);
    if (!Number.isFinite(item.subtotal) || item.subtotal < 0 || !Number.isSafeInteger(grossCents)) throw new Error("Invalid sale amount.");
    if (amountCents > grossCents) throw new Error("The per-unit discount exceeds this product row total.");
    return { grossLineTotal: grossCents / 100, discountAmount: amountCents / 100, lineTotal: (grossCents - amountCents) / 100 };
  });
  const sumCents = (key: "grossLineTotal" | "discountAmount" | "lineTotal") =>
    lines.reduce((sum, line) => sum + Math.round(line[key] * 100), 0) / 100;
  return { subtotal: sumCents("grossLineTotal"), discountAmount: sumCents("discountAmount"), totalAmount: sumCents("lineTotal"), lines };
}
