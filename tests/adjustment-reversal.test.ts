import assert from "node:assert/strict";
import test from "node:test";
import { reversalQuantity } from "../lib/adjustment-reversal";

test("reverses stock additions and deductions without changing the original record", () => {
  assert.equal(reversalQuantity(12, 12, 12), 0);
  assert.equal(reversalQuantity(8, 8, -4), 12);
});
test("blocks reversal after stock changed or if result would be negative", () => {
  assert.throws(() => reversalQuantity(10, 12, 12), /Stock has changed/);
  assert.throws(() => reversalQuantity(5, 5, 12), /Insufficient stock/);
  assert.throws(() => reversalQuantity(NaN, 5, 1), /Invalid/);
});
