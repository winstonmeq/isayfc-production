export function validOutletStockCorrection(value: unknown, unit: string, packSize = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER &&
    (!(packSize > 0 || ["HEAD", "PCS", "PACK", "BAG"].includes(unit)) || Number.isSafeInteger(value));
}

export function canRemoveOutletStock(quantity: number, menuLinked: boolean) {
  return quantity === 0 && !menuLinked;
}
