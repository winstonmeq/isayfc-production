import assert from "node:assert/strict";
import test from "node:test";
import { moneyAmount, outletCashSummary, remainingAmount } from "../lib/employee-finance";

test("monetary amounts require positive exact cents", () => {
  assert.equal(moneyAmount("200.50"), 200.5);
  for (const invalid of [0, -1, Infinity, NaN, 0.001, "", "no", null, true]) assert.throws(() => moneyAmount(invalid));
});

test("remaining amounts calculate remaining balance and reject excess", () => {
  assert.equal(remainingAmount(200, 0, 50), 150);
  assert.equal(remainingAmount(200, 50, 150), 0);
  assert.throws(() => remainingAmount(200, 50, 151));
  assert.equal(remainingAmount(0.3, 0.1, 0.2), 0);
});

test("outlet cash summary calculates net cash movement correctly", () => {
  const cash = outletCashSummary(100, 0, 20, 0);
  assert.equal(cash.netCashMovement, 80);
  assert.equal(cash.cashSales, 100);
  assert.equal(cash.expenses, 20);
});
