import assert from "node:assert/strict";
import test from "node:test";

import {
  formatStock,
  fromBaseQuantity,
  normalizeBaseUnit,
  packingSnapshot,
  toBaseQuantity,
  toBaseUnitCost,
} from "../lib/inventory-units";

test("C10 pack entry converts to PCS base stock", () => {
  const packing = packingSnapshot({
    unit: "PACK",
    baseUnit: "PCS",
    multiplier: 50,
  });

  assert.equal(toBaseQuantity(2, packing), 100);
  assert.deepEqual(fromBaseQuantity(118, packing), {
    baseQty: 118,
    fullUnits: 2,
    looseBaseQty: 18,
    multiplier: 50,
  });
  assert.equal(formatStock(118, packing), "2 pack(s) + 18 pcs");
});

test("whole chicken remains HEAD without conversion", () => {
  const packing = packingSnapshot({ unit: "HEAD", baseUnit: "HEAD" });
  assert.equal(toBaseQuantity(12, packing), 12);
  assert.equal(formatStock(12, packing), "12 head");
  assert.equal(normalizeBaseUnit("head"), "HEAD");
});

test("grocery quantity remains QTY without pack conversion", () => {
  const packing = packingSnapshot({ unit: "QTY", baseUnit: "QTY" });
  assert.equal(toBaseQuantity(7, packing), 7);
  assert.equal(formatStock(7, packing), "7 qty");
});

test("package cost is converted to per-PCS cost", () => {
  const packing = packingSnapshot({
    unit: "PACK",
    baseUnit: "PCS",
    multiplier: 50,
  });
  assert.equal(toBaseUnitCost(395, packing), 7.9);
});
