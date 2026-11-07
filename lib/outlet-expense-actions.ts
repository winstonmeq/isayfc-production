export function outletExpenseActions(origin?: string) {
  const manual = !origin || origin === "MANUAL";
  return { canEdit: manual, canVoid: manual || origin === "STOCK_USAGE" };
}

export function restoreConsumedStock(item: { stockQty: number; buyingPrice: number; packSize: number; companyUnitCost?: number }, usage: { quantity?: number; unitCost?: number; companyAmount?: number }) {
  const quantity = usage.quantity, unitCost = usage.unitCost;
  if (quantity == null || unitCost == null || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0 || item.stockQty < 0 || !Number.isFinite(item.stockQty) || !Number.isFinite(item.buyingPrice) || item.buyingPrice < 0 || !Number.isFinite(item.packSize) || item.packSize < 0) throw new Error("Stock usage cannot be safely reversed. Review the linked inventory and cost snapshots.");
  const multiplier = item.packSize > 0 ? item.packSize : 1;
  const newStock = item.stockQty + quantity;
  if (!Number.isFinite(newStock) || newStock > Number.MAX_SAFE_INTEGER || usage.companyAmount == null || !Number.isFinite(usage.companyAmount) || usage.companyAmount < 0 || (item.stockQty > 0 && (item.companyUnitCost == null || !Number.isFinite(item.companyUnitCost) || item.companyUnitCost < 0))) throw new Error("Original company costs are missing. Review inventory before reversing this consumption.");
  return {
    newStock,
    buyingPrice: ((item.stockQty * item.buyingPrice / multiplier + quantity * unitCost) / newStock) * multiplier,
    companyUnitCost: ((item.stockQty > 0 ? item.stockQty * Number(item.companyUnitCost) : 0) + usage.companyAmount) / newStock,
  };
}
