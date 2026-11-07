type Item = { itemStatus: string; receivedPcs?: number; varianceQty?: number };
export function deliveryDecisionSummary(items: Item[]) {
  return {
    complete: items.length > 0 && items.every(item => item.itemStatus !== "PENDING"),
    hasDiscrepancy: items.some(item => item.itemStatus === "REJECTED" || item.itemStatus === "PARTIAL"),
    received: items.reduce((sum, item) => sum + Number(item.receivedPcs || 0), 0),
    variance: items.reduce((sum, item) => sum + Number(item.varianceQty || 0), 0),
  };
}
