import test from "node:test";
import assert from "node:assert/strict";
import { mainOperatingExpenseFilter, excludeLegacyDeliveryExpenses } from "../lib/main-expense-policy";
import { buildOverallBusinessReport } from "../lib/overall-business-report";

test("main expense queries exclude old internal delivery postings and outlet OpEx", () => {
  assert.deepEqual(mainOperatingExpenseFilter(), { isActive: true, outletId: null, expenseCategory: { $ne: "OUTLET" }, origin: { $ne: "OWNER_OUTLET_DELIVERY" }, type: { $ne: "OWNER_OUTLET_DELIVERY" }, capitalizedByBatch: null });
  assert.equal(excludeLegacyDeliveryExpenses().origin.$ne, "OWNER_OUTLET_DELIVERY");
});
test("legacy origin and legacy type both stay out of overall operating expenses", () => {
  const date = "2026-11-07T00:00:00Z";
  const report = buildOverallBusinessReport([], [], [
    { id: "old-origin", date, name: "Delivery", type: "OTHER", origin: "OWNER_OUTLET_DELIVERY", amount: 500 },
    { id: "old-type", date, name: "Delivery", type: "OWNER_OUTLET_DELIVERY", amount: 500 },
    { id: "rent", date, name: "Rent", type: "RENT", amount: 100 },
    { id: "labor", date, name: "Production labor", type: "LABOR", amount: 300, capitalizedByBatch: "batch-1" },
  ], []);
  assert.equal(report.totals.operatingExpenses, 100);
  assert.equal(report.expenseRows.length, 1);
});
