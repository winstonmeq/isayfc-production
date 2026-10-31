import assert from "node:assert/strict";
import test from "node:test";
import { invoiceSettlement, purchaseFinanceInput, purchaseFinanceSnapshot, samePurchaseLines } from "../lib/purchase-finance";

const input = { supplierId: "123456789012345678901234", invoiceNumber: " inv-1 ", datePurchased: "2026-10-31", dueDate: "2026-11-30", paymentMode: "CREDIT" };
test("grocery invoice input requires supplier, invoice number and valid date sequence", () => {
  assert.equal(purchaseFinanceInput(input).invoiceNumber, "INV-1");
  for (const change of [{ supplierId: "" }, { invoiceNumber: "" }, { datePurchased: "2026-02-30" }, { dueDate: "2026-10-01" }, { paymentMode: "OTHER" }]) assert.throws(() => purchaseFinanceInput({ ...input, ...change }));
});

test("credit creates one payable while cash records only the remaining balance", () => {
  assert.deepEqual(invoiceSettlement(100, 0, false), { amount: 100, payment: 0, paidAmount: 0, balance: 100, status: "UNPAID" });
  assert.equal(invoiceSettlement(100, 30, false).status, "PARTIAL");
  assert.equal(invoiceSettlement(100, 30, true).payment, 70);
  assert.equal(invoiceSettlement(100, 100, true).payment, 0); // Repeat edit cannot pay twice.
  assert.equal(invoiceSettlement(120, 100, true).payment, 20);
  assert.throws(() => invoiceSettlement(90, 100, false));
  assert.throws(() => invoiceSettlement(Infinity, 0, true));
});

test("legacy grocery batches remain visibly unlinked without invented balances", () => {
  const legacy = purchaseFinanceSnapshot({});
  assert.equal(legacy.invoiceStatus, "NOT LINKED");
  assert.equal(legacy.balance, null);
  const linked = purchaseFinanceSnapshot({ supplierId: { _id: "s", name: "Supplier" }, supplierInvoiceId: { _id: "i", status: "PARTIAL", paidAmount: 30, balance: 70 } });
  assert.equal(linked.balance, 70);
  assert.equal(linked.supplierName, "Supplier");
});

test("invoice-only edits preserve inventory even when item order differs", () => {
  const items = [{ productId: "a", buyingPrice: 5, quantity: 2 }, { productId: "b", buyingPrice: 10, quantity: 1 }];
  assert.equal(samePurchaseLines(items, [...items].reverse()), true);
  assert.equal(samePurchaseLines(items, [{ ...items[0], quantity: 3 }, items[1]]), false);
  assert.equal(samePurchaseLines(items, [{ ...items[0], buyingPrice: 6 }, items[1]]), false);
});
