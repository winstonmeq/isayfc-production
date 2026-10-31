export function reversalQuantity(current: number, originalNew: number, adjusted: number) {
  if (![current, originalNew, adjusted].every(Number.isFinite)) throw new Error("Invalid adjustment quantities.");
  if (Math.abs(current - originalNew) > 0.000001) throw new Error("Stock has changed since this adjustment. Review the stock ledger and post a new correction instead.");
  const next = current - adjusted;
  if (next < 0) throw new Error("Insufficient stock to reverse this adjustment.");
  return next;
}
