/** Whole chicken is bought per KG, even when priced/sold per head. */
export function chickenRelease(heads: number, kilos: number, stockHeads: number, stockKilos: number, costPerKg: number) {
  if (!Number.isSafeInteger(heads) || heads <= 0 || !Number.isFinite(kilos) || kilos <= 0 || heads > stockHeads || kilos > stockKilos || !Number.isFinite(costPerKg) || costPerKg < 0) throw new Error("Enter available whole heads and their actual kilos.");
  if ((heads === stockHeads) !== (Math.abs(kilos - stockKilos) < 0.000001)) throw new Error("Releasing all heads must also release their remaining kilos, and vice versa.");
  return { kilosOut: kilos, costPerHead: kilos * costPerKg / heads };
}

/** Omitted weight uses the current inventory average; explicit weight remains strictly validated. */
export function resolveChickenRelease(heads: number, kilos: unknown, stockHeads: number, stockKilos: number, costPerKg: number) {
  const estimated = kilos === undefined || kilos === null || kilos === "";
  if (estimated && (!Number.isFinite(stockHeads) || stockHeads <= 0 || !Number.isFinite(stockKilos) || stockKilos <= 0)) {
    throw new Error("Cannot estimate chicken weight: available heads and kilos must be recorded in inventory.");
  }
  const weight = estimated ? (heads === stockHeads ? stockKilos : stockKilos / stockHeads * heads) : Number(kilos);
  return { ...chickenRelease(heads, weight, stockHeads, stockKilos, costPerKg), weightBasis: estimated ? "ESTIMATED" as const : "ACTUAL" as const };
}
