export const DEFAULT_PRODUCT_UNITS = [
  { code: "PCS", name: "Piece", allowsDecimal: false },
  { code: "PACK", name: "Pack", allowsDecimal: false },
  { code: "UNIT", name: "Unit", allowsDecimal: false },
  { code: "BTL", name: "Bottle", allowsDecimal: false },
  { code: "KG", name: "Kilogram", allowsDecimal: true },
  { code: "HEAD", name: "Chicken head / whole chicken", allowsDecimal: false },
  { code: "BAG", name: "Bag", allowsDecimal: false },
] as const;
export function normalizeUnitCode(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return code === "KL" || code === "KILO" || code === "KILOS" ? "KG" : code;
}
export function validUnitQuantity(quantity: number, allowsDecimal: boolean) {
  return Number.isFinite(quantity) && quantity >= 0 && quantity <= Number.MAX_SAFE_INTEGER && (allowsDecimal || Number.isSafeInteger(quantity));
}
export function canChangeProductUnit(stock: number, history: boolean, before: string, after: string) {
  return before === after || (stock === 0 && !history);
}
