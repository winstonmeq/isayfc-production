export function adjustmentQuantities(previous: { qty: number; kilos: number }, next: { qty: number; kilos?: number }, whole: boolean) {
  if (!Number.isFinite(next.qty) || next.qty < 0 || next.qty > Number.MAX_SAFE_INTEGER) throw new Error("Enter a valid non-negative quantity.");
  if (whole && (!Number.isSafeInteger(next.qty) || next.kilos == null || !Number.isFinite(next.kilos) || next.kilos < 0)) throw new Error("Whole chicken requires whole heads and actual kilos.");
  if (whole && ((next.qty === 0) !== (next.kilos === 0))) throw new Error("Heads and kilos must both be zero, or both positive.");
  const kilos = whole ? next.kilos! : previous.kilos;
  return { newQty: next.qty, previousQty: previous.qty, adjustedQty: next.qty - previous.qty,
    ...(whole ? { previousKilos: previous.kilos, newKilos: kilos, adjustedKilos: kilos - previous.kilos } : {}) };
}
