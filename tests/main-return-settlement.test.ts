import test from "node:test";
import assert from "node:assert/strict";
import { mainSaleBalance, returnSettlement } from "../lib/main-return-settlement";

test("unpaid return credits receivable without a fake cash payment", () => {
  assert.deepEqual(returnSettlement({ totalAmount: 100, paidAmount: 0 }, 30), { credit: 30, refund: 0, balance: 70 });
});
test("fully paid return refunds only the returned amount", () => {
  assert.deepEqual(returnSettlement({ totalAmount: 100, paidAmount: 100 }, 30), { credit: 0, refund: 30, balance: 0 });
});
test("partial payment credits unpaid first and refunds the remainder", () => {
  assert.deepEqual(returnSettlement({ totalAmount: 100, paidAmount: 80 }, 50), { credit: 20, refund: 30, balance: 0 });
});
test("subsequent collections retain return credit and original payment history", () => {
  assert.equal(mainSaleBalance({ totalAmount: 100, returnedAmount: 30, paidAmount: 40 }), 30);
  assert.deepEqual(returnSettlement({ totalAmount: 100, returnedAmount: 30, paidAmount: 40 }, 50), { credit: 30, refund: 20, balance: 0 });
});
test("repeated returns cannot refund beyond remaining sale/payment", () => {
  const sale = { totalAmount: 100, paidAmount: 100, returnedAmount: 60, refundedAmount: 60 };
  assert.deepEqual(returnSettlement(sale, 40), { credit: 0, refund: 40, balance: 0 });
  assert.throws(() => returnSettlement(sale, 41));
  assert.throws(() => returnSettlement(sale, NaN));
});
