import Unit from "@/models/ProductUnit";
import Product from "@/models/Product";
import BodegaProduct from "@/models/BodegaProduct";
import { DEFAULT_PRODUCT_UNITS, normalizeUnitCode, validUnitQuantity } from "./product-unit-policy";
export async function ensureProductUnits() {
  await Unit.bulkWrite(DEFAULT_PRODUCT_UNITS.map((unit) => ({ updateOne: { filter: { code: unit.code }, update: { $setOnInsert: { ...unit, isSystem: true, isActive: true } }, upsert: true } })), { ordered: false });
}
export async function activeProductUnit(input: unknown, fallback = "PCS") {
  await ensureProductUnits();
  return Unit.findOne({ code: normalizeUnitCode(input) || fallback, isActive: true }).lean();
}
export async function unitInUse(code: string) {
  const [grocery, bodega] = await Promise.all([Product.exists({ unitCode: code }), BodegaProduct.exists({ unitCode: code })]);
  return !!grocery || !!bodega;
}
export async function productQuantityAllowed(input: unknown, quantity: number) {
  const code = normalizeUnitCode(input) || "PCS";
  const standard = DEFAULT_PRODUCT_UNITS.find((unit) => unit.code === code);
  if (standard) return validUnitQuantity(quantity, standard.allowsDecimal);
  const unit = await Unit.findOne({ code, isActive: true }).lean();
  return !!unit && validUnitQuantity(quantity, unit.allowsDecimal);
}
