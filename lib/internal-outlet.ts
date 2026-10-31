/** Internal allocations are neither external revenue nor customer receivables. */
export function internalOutletMatchClauses(): Record<string, unknown>[] {
  return [
    { transactionType: "INTERNAL_TRANSFER" },
  ];
}
export function isInternalOutletTransaction(row: { transactionType?: string; stockTransferId?: unknown; source?: string }) {
  return row.transactionType === "INTERNAL_TRANSFER";
}
export function internalReceiptSettlement() {
  return { transactionType: "INTERNAL_TRANSFER", fulfillmentStatus: "RECOGNIZED", status: "INTERNAL", paidAmount: 0, balance: 0 } as const;
}
