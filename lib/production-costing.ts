export type ProductionIngredientCost = {
  inventoryId: string;
  quantity: number;
  unitCost: number;
};

export function calculateProductionBatchCost(args: {
  ingredients: ProductionIngredientCost[];
  outputQty: number;
  existingOutputQty?: number;
  existingOutputUnitCost?: number;
}) {
  const outputQty = Number(args.outputQty);
  if (!Number.isInteger(outputQty) || outputQty < 1) {
    throw new Error("Output quantity must be a whole number of at least 1.");
  }
  if (!args.ingredients.length) throw new Error("Add at least one ingredient.");

  let totalBatchCost = 0;
  for (const ingredient of args.ingredients) {
    const quantity = Number(ingredient.quantity);
    const unitCost = Number(ingredient.unitCost);
    if (!ingredient.inventoryId || !Number.isFinite(quantity) || quantity <= 0 || quantity > Number.MAX_SAFE_INTEGER) {
      throw new Error("Every ingredient needs a valid positive quantity.");
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error("Every ingredient needs a valid unit cost.");
    }
    totalBatchCost += quantity * unitCost;
  }

  const producedUnitCost = totalBatchCost / outputQty;
  const existingQty = Math.max(0, Number(args.existingOutputQty || 0));
  const existingCost = Math.max(0, Number(args.existingOutputUnitCost || 0));
  const weightedUnitCost = existingQty > 0
    ? (existingQty * existingCost + totalBatchCost) / (existingQty + outputQty)
    : producedUnitCost;

  return {
    totalBatchCost: Math.round(totalBatchCost * 100) / 100,
    producedUnitCost: Math.round(producedUnitCost * 10000) / 10000,
    weightedUnitCost: Math.round(weightedUnitCost * 10000) / 10000,
  };
}

export function calculateOutletProfit(args: {
  soldQty: number;
  sellingPrice: number;
  unitCost: number;
  expenses?: number;
}) {
  const revenue = args.soldQty * args.sellingPrice;
  const cogs = args.soldQty * args.unitCost;
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - Number(args.expenses || 0);
  return { revenue, cogs, grossProfit, netProfit };
}
