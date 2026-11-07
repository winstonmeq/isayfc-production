export function mainProductionCost(lines: { quantity: number; unitCost: number; whole: boolean; kilos?: number }[], outputKilos: number, previousQty = 0, previousCost = 0) {
  if (!Number.isFinite(outputKilos) || outputKilos <= 0 || outputKilos > Number.MAX_SAFE_INTEGER || !lines.length) throw new Error("Enter ingredients and positive finished kilos.");
  let cost = 0;
  for (const row of lines) {
    if (!Number.isFinite(row.quantity) || row.quantity <= 0 || !Number.isFinite(row.unitCost) || row.unitCost < 0) throw new Error("Invalid ingredient quantity or cost.");
    if (row.whole && (!Number.isSafeInteger(row.quantity) || !Number.isFinite(row.kilos) || row.kilos! <= 0)) throw new Error("Whole chicken requires heads and actual kilos used.");
    cost += (row.whole ? row.kilos! : row.quantity) * row.unitCost;
  }
  if (![cost, previousQty, previousCost].every(Number.isFinite) || previousQty < 0 || previousCost < 0) throw new Error("Invalid inventory valuation.");
  return { totalCost: cost, costPerKilo: cost / outputKilos, weightedCost: (previousQty * previousCost + cost) / (previousQty + outputKilos) };
}
