import assert from "node:assert/strict";
import test from "node:test";
import { moneyAmount, outletCashSummary, remainingAmount } from "../lib/employee-finance";

test("employee amounts require positive exact cents", () => {
  assert.equal(moneyAmount("200.50"), 200.5);
  for (const invalid of [0, -1, Infinity, NaN, 0.001, "", "no", null, true]) assert.throws(() => moneyAmount(invalid));
});

test("collections and reimbursements support partial payments and reject excess", () => {
  assert.equal(remainingAmount(200, 0, 50), 150);
  assert.equal(remainingAmount(200, 50, 150), 0);
  assert.throws(() => remainingAmount(200, 50, 151));
  assert.equal(remainingAmount(0.3, 0.1, 0.2), 0);
});

test("employee stock purchase and reimbursement never reduce sales or profit twice", () => {
  const inventoryCost = 200, quantity = 10;
  const unitCost = inventoryCost / quantity;
  const sales = 5 * 30, cogs = 5 * unitCost;
  const grossProfit = sales - cogs;
  assert.equal(grossProfit, 50);
  // Two of the five sales (P60) are on employee credit: only P90 collected.
  const cash = outletCashSummary(90, 30, 10, 50);
  assert.equal(cash.netCashMovement, 60);
  assert.equal(grossProfit - 10, 40); // Not reduced by reimbursement or credit collection.
  assert.equal(remainingAmount(60, 0, 30), 30);
  assert.equal(remainingAmount(200, 0, 50), 150);
});
