import { roundMoney } from "./report-utils";
import { validOutletStockCorrection } from "./outlet-inventory-edit";

export function stockConsumptionType(usage: unknown) {
  return usage === "SELLING_EXPENSE" ? "SELLING_EXPENSES" : usage === "OPERATING_EXPENSE" ? "OPERATING_EXPENSES" : null;
}

export function stockConsumptionCost(item: { stockQty: number; unitLabel: string; packSize: number; buyingPrice: number; companyUnitCost?: number }, quantity: number) {
  if (!validOutletStockCorrection(quantity, item.unitLabel, item.packSize) || quantity <= 0 || quantity > item.stockQty) throw new Error("Enter a valid quantity within available stock.");
  const unitCost = item.packSize > 0 ? item.buyingPrice / item.packSize : item.buyingPrice;
  if (!Number.isFinite(unitCost) || unitCost < 0 || item.companyUnitCost == null || !Number.isFinite(item.companyUnitCost) || item.companyUnitCost < 0) throw new Error("This stock needs valid outlet and original company costs before consumption can be posted.");
  return { unitCost, amount: roundMoney(quantity * unitCost), companyAmount: roundMoney(quantity * item.companyUnitCost), newStock: item.stockQty - quantity };
}
