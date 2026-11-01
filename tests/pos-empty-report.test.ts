import test from "node:test";
import assert from "node:assert/strict";
import { emptyPosDailyReport } from "../lib/pos-empty-report";

test("no-outlet response supports date, table totals and daily cash without crashing", () => {
  const report = emptyPosDailyReport("2026-11-01T00:00:00.000Z");
  assert.ok(Number.isFinite(new Date(report.date).getTime()));
  assert.equal(report.transactions.length, 0);
  assert.equal(report.revenue, 0);
  assert.equal(report.cash.netCashMovement, 0);
  assert.notEqual(report.transactions, emptyPosDailyReport(report.date).transactions);
});
