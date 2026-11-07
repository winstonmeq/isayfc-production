import test from "node:test";
import assert from "node:assert/strict";
import { adjustmentQuantities } from "../lib/adjustment-quantities";
import { reversalQuantity } from "../lib/adjustment-reversal";
import { reconcileChickenKilos } from "../lib/chicken-reconciliation";

test("whole chicken independently corrects heads and kilos", () => {
  assert.deepEqual(adjustmentQuantities({ qty: 10, kilos: 15 }, { qty: 9, kilos: 13.4 }, true),
    { previousQty: 10, newQty: 9, adjustedQty: -1, previousKilos: 15, newKilos: 13.4, adjustedKilos: 13.4 - 15 });
});
test("whole chicken requires actual weight and whole heads", () => {
  for (const next of [{ qty: 9 }, { qty: 1.5, kilos: 2 }, { qty: 0, kilos: 2 }, { qty: 2, kilos: 0 }, { qty: 2, kilos: -1 }]) {
    assert.throws(() => adjustmentQuantities({ qty: 10, kilos: 15 }, next, true));
  }
});
test("kilo-only adjustment reconstructs reconciliation and reverses independently", () => {
  const plan = adjustmentQuantities({ qty: 10, kilos: 15 }, { qty: 10, kilos: 14 }, true);
  const balance = reconcileChickenKilos(14, [{ transactionDate: "2026-11-07T04:00:00Z", previousStock: 10, newStock: 10, kilos: 1, kilosDelta: plan.adjustedKilos, referenceType: "INVENTORY_ADJUSTMENT" }], new Date("2026-11-07T00:00:00Z"), new Date("2026-11-08T00:00:00Z"));
  assert.equal(balance.opening, 15); assert.equal(balance.other, -1); assert.equal(balance.incomplete, false);
  assert.equal(reversalQuantity(14, 14, -1), 15);
  assert.throws(() => reversalQuantity(13, 14, -1));
});
test("cuts accept base pieces and grocery may use fractional base quantities", () => {
  assert.equal(adjustmentQuantities({ qty: 120, kilos: 0 }, { qty: 2 * 50 }, false).adjustedQty, -20);
  assert.equal(adjustmentQuantities({ qty: 5, kilos: 0 }, { qty: 3.5 }, false).newQty, 3.5);
  assert.throws(() => adjustmentQuantities({ qty: 1, kilos: 0 }, { qty: NaN }, false));
});
