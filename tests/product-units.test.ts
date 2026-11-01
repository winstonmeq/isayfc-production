import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRODUCT_UNITS, normalizeUnitCode, validUnitQuantity, canChangeProductUnit } from "../lib/product-unit-policy";

test("unit catalog includes common product quantities and normalizes kilograms", () => {
  for (const code of ["PCS", "PACK", "UNIT", "BTL", "KG", "HEAD", "BAG"]) {
    assert.ok(DEFAULT_PRODUCT_UNITS.some((unit) => unit.code === code));
  }
  assert.equal(normalizeUnitCode(" kl "), "KG");
  assert.equal(normalizeUnitCode(" btl "), "BTL");
});
test("count units reject fractions while measured units permit them", () => {
  assert.equal(validUnitQuantity(1.5, false), false);
  assert.equal(validUnitQuantity(1.5, true), true);
  for (const quantity of [-1, NaN, Infinity]) assert.equal(validUnitQuantity(quantity, true), false);
});
test("stock or history prevents changing the meaning of a product quantity", () => {
  assert.equal(canChangeProductUnit(1, false, "PCS", "KG"), false);
  assert.equal(canChangeProductUnit(0, true, "PCS", "KG"), false);
  assert.equal(canChangeProductUnit(0, false, "PCS", "KG"), true);
  assert.equal(canChangeProductUnit(5, true, "PCS", "PCS"), true);
});
