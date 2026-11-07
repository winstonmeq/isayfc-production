import test from "node:test";
import assert from "node:assert/strict";
import { outletReportTotals } from "../lib/outlet-report-totals";

test("credit revenue and non-cash expenses affect profit, not cash collections", () => {
  const totals = outletReportTotals([{ sales: 100, cogs: 40 }, { sales: 60, cogs: 20 }], [{ amount: 10 }, { amount: 15 }], [{ cashIn: 100, cashOut: 10 }]);
  assert.equal(totals.netProfit, 75);
  assert.equal(totals.netCash, 90);
});
test("collections and reimbursements are cash movements, not additional sales or expenses", () => {
  const totals = outletReportTotals([], [], [{ cashIn: 60, cashOut: 0 }, { cashIn: 0, cashOut: 30 }]);
  assert.equal(totals.netProfit, 0);
  assert.equal(totals.netCash, 30);
});
test("empty outlet report remains zero and expenses can produce a loss", () => {
  assert.equal(outletReportTotals([], [], []).netProfit, 0);
  assert.equal(outletReportTotals([], [{ amount: 50 }], []).netProfit, -50);
});
