/** Retain old automatic rows for audit, but never count an internal delivery as OpEx. */
export const LEGACY_OWNER_DELIVERY_EXPENSE = "OWNER_OUTLET_DELIVERY" as const;
export function excludeLegacyDeliveryExpenses() {
  return { origin: { $ne: LEGACY_OWNER_DELIVERY_EXPENSE }, type: { $ne: LEGACY_OWNER_DELIVERY_EXPENSE }, capitalizedByBatch: null };
}
export function mainOperatingExpenseFilter() {
  return { isActive: true, outletId: null, expenseCategory: { $ne: "OUTLET" }, ...excludeLegacyDeliveryExpenses() };
}
