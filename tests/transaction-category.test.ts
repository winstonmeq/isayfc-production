import test from "node:test";
import assert from "node:assert/strict";
import { saleBusinessCategory, expenseBusinessCategory } from "../lib/transaction-category";
test("all outlet activities share OUTLET regardless of product or outlet name", () => {
  assert.equal(saleBusinessCategory({ source: "CHICKEN", ownerOutletId: "a" }), "OUTLET");
  assert.equal(saleBusinessCategory({ source: "BODEGA", customerId: { outletId: "b" } }), "OUTLET");
  assert.equal(saleBusinessCategory({ source: "OUTLET", outletId: "a" }), "OUTLET");
  assert.equal(saleBusinessCategory({ receiptNumber: "MOB-123" }), "OUTLET");
  assert.equal(expenseBusinessCategory({ expenseCategory: "GROCERY", beneficiaryOutletId: "a" }), "OUTLET");
  assert.equal(expenseBusinessCategory({ expenseCategory: "OUTLET", outletId: "b" }), "OUTLET");
});
test("main categories and underlying accounting values are preserved", () => {
  assert.equal(saleBusinessCategory({ source: "CHICKEN" }), "BODEGA");
  assert.equal(saleBusinessCategory({ source: "BODEGA" }), "GROCERY");
  assert.equal(saleBusinessCategory({ source: "MIXED" }), "MIXED");
  const expense = { expenseCategory: "BODEGA", origin: "OWNER_OUTLET_DELIVERY", amount: 840 };
  assert.equal(expenseBusinessCategory(expense), "OUTLET");
  assert.deepEqual(expense, { expenseCategory: "BODEGA", origin: "OWNER_OUTLET_DELIVERY", amount: 840 });
});
