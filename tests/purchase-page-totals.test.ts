import test from "node:test";
import assert from "node:assert/strict";
import { purchasePageTotals } from "../lib/purchase-page-totals";
test("purchase page sums quantities, lines and linked invoice amounts", () => {
  assert.deepEqual(purchasePageTotals([{ lineCount: 1, totalItems: 10, totalAmount: 790, paidAmount: 0, balance: 790 }, { lineCount: 1, totalItems: 10, totalAmount: 980, paidAmount: 980, balance: 0 }]), { lines: 2, quantity: 20, amount: 1770, paid: 980, balance: 790 });
});
test("unlinked purchases do not invent paid balances", () => {
  assert.equal(purchasePageTotals([{ totalItems: 1, totalAmount: 50, balance: null, paidAmount: 50 }]).paid, 0);
  assert.equal(purchasePageTotals([]).amount, 0);
});
