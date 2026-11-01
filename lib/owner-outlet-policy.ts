/** Owner outlets remain regular customers in standalone main accounts. */
export function mainTransactionType(outletId: unknown) {
  void outletId;
  return "EXTERNAL_SALE";
}

/** Historical base-unit snapshot, never the selling/marked-up transfer price. */
export function allocationLineCost(line: { baseQty?: number; stockPcsOut?: number; qty?: number; unitCost?: number }) {
  const quantity = Number(line.baseQty ?? line.stockPcsOut ?? line.qty);
  if (!Number.isFinite(quantity) || quantity < 0 || line.unitCost == null || !Number.isFinite(line.unitCost) || line.unitCost < 0) return null;
  return quantity * line.unitCost;
}
