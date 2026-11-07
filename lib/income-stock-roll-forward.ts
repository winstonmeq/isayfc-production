type Movement = { transactionDate: Date | string; previousStock?: number; newStock?: number; referenceType?: string };
const qty = (n: number) => Math.round(n * 1000000) / 1000000;

/** Preserve every ledger delta, including void reversals, to reconstruct historical balances. */
export function incomeStockRollForward(current: number, movements: Movement[], start: Date, end: Date, soldUnits: number) {
  let afterStart = 0, afterEnd = 0, received = 0, processed = 0;
  for (const row of movements) {
    const date = new Date(row.transactionDate);
    if (date < start) continue;
    const delta = Number(row.newStock || 0) - Number(row.previousStock || 0);
    afterStart += delta;
    if (date >= end) { afterEnd += delta; continue; }
    if (delta > 0 && ["DELIVERY", "PURCHASE_BATCH"].includes(row.referenceType || "")) received += delta;
    if (delta > 0 && row.referenceType === "SLICING_BATCH") processed += delta;
  }
  const beginning = qty(current - afterStart), ending = qty(current - afterEnd);
  // Includes production usage/output, returns, transfers, corrections, reversals,
  // and differences between stock movement date and sales recognition date.
  const otherNet = qty(ending - beginning - received - processed + soldUnits);
  return { beginning, received: qty(received), processed: qty(processed), otherNet, ending };
}
