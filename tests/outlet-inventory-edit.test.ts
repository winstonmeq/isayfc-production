import test from "node:test";
import assert from "node:assert/strict";
import { validOutletStockCorrection, canRemoveOutletStock } from "../lib/outlet-inventory-edit";

test("outlet inventory corrections accept zero but reject invalid stock quantities", () => {
  assert.equal(validOutletStockCorrection(0, "PCS"), true);
  assert.equal(validOutletStockCorrection(50, "PCS", 50), true);
  assert.equal(validOutletStockCorrection(1.5, "KG"), true);
  for (const value of [-1, NaN, Infinity, "50", null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validOutletStockCorrection(value, "PCS"), false);
  }
  for (const unit of ["HEAD", "PCS", "BAG", "PACK"]) assert.equal(validOutletStockCorrection(1.5, unit), false);
  assert.equal(validOutletStockCorrection(1.5, "QTY", 50), false);
});

test("inventory deletion requires exactly zero stock and no active menu link", () => {
  assert.equal(canRemoveOutletStock(0, false), true);
  assert.equal(canRemoveOutletStock(0, true), false);
  assert.equal(canRemoveOutletStock(1, false), false);
  assert.equal(canRemoveOutletStock(-1, false), false);
});
