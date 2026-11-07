/** Whole chicken is bought per KG, even when priced/sold per head. */
export function chickenRelease(heads: number, kilos: number, stockHeads: number, stockKilos: number, costPerKg: number) {
  if (!Number.isSafeInteger(heads) || heads <= 0 || !Number.isFinite(kilos) || kilos <= 0 || heads > stockHeads || kilos > stockKilos || !Number.isFinite(costPerKg) || costPerKg < 0) throw new Error("Enter available whole heads and their actual kilos.");
  if ((heads === stockHeads) !== (Math.abs(kilos - stockKilos) < 0.000001)) throw new Error("Releasing all heads must also release their remaining kilos, and vice versa.");
  return { kilosOut: kilos, costPerHead: kilos * costPerKg / heads };
}
