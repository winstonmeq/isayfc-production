/** Owner outlets are branches, not collectible customers. Never fake cash. */
export const INTERNAL_PAYMENT_LABEL = "Internal — No Payment Required";
export function ownerOutletSettlement() {
  return { status: "INTERNAL", paidAmount: 0, balance: 0 } as const;
}
export function mainPaymentStatus(status?: string) {
  return status === "INTERNAL" ? INTERNAL_PAYMENT_LABEL : status || "UNPAID";
}
/** Payment-only filter: do not hide marked-up main sales in reports. */
export function nonCollectibleSaleClauses(): Record<string, unknown>[] {
  return [{ transactionType: "INTERNAL_TRANSFER" }, { ownerOutletId: { $exists: true, $ne: null } }, { status: "INTERNAL" }];
}
