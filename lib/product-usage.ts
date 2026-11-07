export const PRODUCT_USAGE_OPTIONS = [
  { value: "UNASSIGNED", label: "Not Set" },
  { value: "RETAIL_RESALE", label: "Retail / Resale Merchandise" },
  { value: "PRODUCTION_COST", label: "Production Cost" },
  { value: "OPERATING_EXPENSE", label: "Operating Expense" },
  { value: "SELLING_EXPENSE", label: "Selling Expense" },
  { value: "PRODUCTION_OVERHEAD", label: "Production Overhead" },
] as const;
export type ProductUsage = (typeof PRODUCT_USAGE_OPTIONS)[number]["value"];
export const PRODUCT_USAGES = PRODUCT_USAGE_OPTIONS.map(option => option.value);
export function isProductUsage(value: unknown): value is ProductUsage {
  return PRODUCT_USAGE_OPTIONS.some(option => option.value === value);
}
export function productUsage(value: unknown): ProductUsage {
  return isProductUsage(value) ? value : "UNASSIGNED";
}
export function productUsageLabel(value: unknown) {
  return PRODUCT_USAGE_OPTIONS.find(option => option.value === productUsage(value))!.label;
}
export function isProductionCost(value: unknown) {
  const u = productUsage(value);
  return u === "PRODUCTION_COST" || u === "PRODUCTION_OVERHEAD" || u === "UNASSIGNED" || u === "RETAIL_RESALE";
}
export function isSellingExpense(value: unknown) {
  return productUsage(value) === "SELLING_EXPENSE";
}
export function isOperatingExpense(value: unknown) {
  return productUsage(value) === "OPERATING_EXPENSE";
}
