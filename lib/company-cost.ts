/** Missing legacy company costs must stay unknown, never fall back to markup. */
export function weightedCompanyCost(previousQty: number, previousCost: number | undefined, incomingQty: number, incomingCost: number | undefined) {
  if (incomingCost == null || !Number.isFinite(incomingCost) || (previousQty > 0 && (previousCost == null || !Number.isFinite(previousCost)))) return undefined;
  return (Math.max(0, previousQty) * Number(previousCost || 0) + incomingQty * incomingCost) / (Math.max(0, previousQty) + incomingQty);
}
export function productionCompanyCost(ingredients: { quantity: number; companyUnitCost?: number }[], outputQty: number) {
  if (outputQty <= 0 || ingredients.some(row => row.companyUnitCost == null || !Number.isFinite(row.companyUnitCost))) return undefined;
  return ingredients.reduce((sum, row) => sum + row.quantity * Number(row.companyUnitCost), 0) / outputQty;
}

/** Allocate original batch cost in the same output-value proportions as branch cost. */
export function allocateCompanyOutputs(ingredients: { quantity: number; companyUnitCost?: number }[], outputs: { quantity: number; weightPerUnit: number }[]) {
  const qty = outputs.reduce((sum, row) => sum + row.quantity, 0);
  const average = productionCompanyCost(ingredients, qty);
  if (average == null) return outputs.map(() => undefined);
  const total = average * qty;
  const weight = outputs.reduce((sum, row) => sum + row.quantity * row.weightPerUnit, 0);
  return outputs.map(row => weight > 0 ? total * row.weightPerUnit / weight : average);
}
