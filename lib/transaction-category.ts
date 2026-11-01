import { getSaleOrigin } from "./sale-origin";
export type BusinessCategory = "BODEGA" | "GROCERY" | "OUTLET" | "MIXED";
type SaleInput = Parameters<typeof getSaleOrigin>[0] & { ownerOutletId?: unknown; customerId?: { outletId?: unknown } | null };
const linked = (id: unknown) => !!id && String(id) !== "NONE";
/** Business label only; inventory source and accounting treatment stay intact. */
export function saleBusinessCategory(sale: SaleInput): BusinessCategory {
  if (linked(sale.ownerOutletId) || linked(sale.outletId) || linked(sale.customerId?.outletId) || getSaleOrigin(sale) === "OUTLET") return "OUTLET";
  const origin = getSaleOrigin(sale);
  return origin === "CHICKEN" ? "BODEGA" : origin === "CHICKEN + GROCERY" ? "MIXED" : "GROCERY";
}
export function expenseBusinessCategory(expense: { outletId?: unknown; beneficiaryOutletId?: unknown; origin?: string; expenseCategory?: string; remarks?: string }): BusinessCategory {
  if (linked(expense.outletId) || linked(expense.beneficiaryOutletId) || expense.origin === "OWNER_OUTLET_DELIVERY" || expense.expenseCategory === "OUTLET" || /MOBILE EXPENSE OUTLET:/i.test(expense.remarks || "")) return "OUTLET";
  return expense.expenseCategory === "GROCERY" ? "GROCERY" : "BODEGA";
}
