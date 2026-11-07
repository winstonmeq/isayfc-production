export type ChickenMovement = {
  kilos?: number; kilosDelta?: number; previousStock?: number; newStock?: number;
  transactionDate: Date | string; referenceType?: string;
  sourceVoided?: boolean;
};

/** Kilograms remain separate from stock quantity (heads). Never convert one to the other. */
export function reconcileChickenKilos(currentKilos: number, movements: ChickenMovement[], start: Date, end: Date) {
  let after = 0, during = 0, other = 0;
  let incomplete = false;
  for (const movement of movements) {
    const at = new Date(movement.transactionDate).getTime();
    if (at < start.getTime()) continue;
    const delta = Number(movement.newStock || 0) - Number(movement.previousStock || 0);
    const kilos = Number(movement.kilos || 0);
    if (delta !== 0 && kilos === 0 && movement.kilosDelta == null) incomplete = true;
    const signed = movement.kilosDelta ?? Math.sign(delta) * kilos;
    if (at >= end.getTime()) after += signed;
    else {
      during += signed;
      // Active receipts/production are shown in their own columns. Voided
      // originals must instead net against their reversal in Other movements.
      // Keep both entries: deleting either would corrupt historical balances,
      // especially when a reversal happens on a later business date.
      if (movement.sourceVoided || !['DELIVERY', 'SLICING_BATCH'].includes(movement.referenceType || '')) other += signed;
    }
  }
  const closing = currentKilos - after;
  return { opening: closing - during, closing, other, incomplete };
}
