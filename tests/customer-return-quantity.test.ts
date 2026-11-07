import test from "node:test";
import assert from "node:assert/strict";
import { customerReturnQuote } from "../lib/customer-return-quantity";
test("return uses discounted selling amount and saved pack conversion", () => {
  assert.deepEqual(customerReturnQuote(2, 0, 1, 700, 100), { baseQuantity: 50, creditAmount: 350 });
});
test("pending returns reserve the original sold quantity", () => {
  assert.throws(() => customerReturnQuote(2, 1, 2, 700, 100), /exceeds/);
  assert.equal(customerReturnQuote(2, 1, 1, 700, 100).creditAmount, 350);
});
test("invalid original quantities and negative returns are blocked", () => {
  assert.throws(() => customerReturnQuote(0, 0, 1, 10, 0));
  assert.throws(() => customerReturnQuote(2, 0, -1, 10, 2));
});
