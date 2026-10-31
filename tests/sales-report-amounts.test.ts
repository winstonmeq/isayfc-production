import assert from "node:assert/strict";
import test from "node:test";
import { applyItemDiscounts } from "../lib/discounts";
import { discountReportSummary, salesReportAmounts } from "../lib/sales-report-amounts";

test("C10 per-unit discount is a sales deduction and is not deducted again as an expense", () => {
  const posted = applyItemDiscounts([{ subtotal: 1000, quantity: 10, discount: { name: "C10 -20", type: "AMOUNT", value: 20, basis: "PER_UNIT" } }]);
  const amounts = salesReportAmounts(posted.lines[0]);
  assert.deepEqual(amounts, { grossSales: 1000, discounts: 200, netSales: 800 });
  const cogs = 500;
  const operatingExpenses = 50;
  const grossProfit = amounts.netSales - cogs;
  assert.equal(grossProfit, 300);
  assert.equal(grossProfit - operatingExpenses, 250);
});

test("legacy sales without discount snapshots retain their full sales amount", () => {
  assert.deepEqual(salesReportAmounts({ lineTotal: 395 }), { grossSales: 395, discounts: 0, netSales: 395 });
  assert.deepEqual(salesReportAmounts({ totalAmount: 395 }), { grossSales: 395, discounts: 0, netSales: 395 });
});

test("fully discounted items still appear in gross sales and discounts", () => {
  assert.deepEqual(salesReportAmounts({ grossLineTotal: 100, lineTotal: 0, discountAmount: 100 }), { grossSales: 100, discounts: 100, netSales: 0 });
});

test("discount summary uses saved names and amounts and excludes undiscounted rows", () => {
  const rows = [
    { lineTotal: 800, grossLineTotal: 1000, discountAmount: 200, discountName: "C10 -20" },
    { lineTotal: 80, grossLineTotal: 100, discountAmount: 20, discountName: "C10 -20" },
    { lineTotal: 100 },
    { lineTotal: 90, discountAmount: 10 },
  ];
  assert.deepEqual(discountReportSummary(rows), [
    { name: "C10 -20", lines: 2, amount: 220 },
    { name: "Other / legacy discounts", lines: 1, amount: 10 },
  ]);
  const gross = rows.reduce((sum, row) => sum + salesReportAmounts(row).grossSales, 0);
  const discounts = rows.reduce((sum, row) => sum + salesReportAmounts(row).discounts, 0);
  const net = rows.reduce((sum, row) => sum + salesReportAmounts(row).netSales, 0);
  assert.equal(gross - discounts, net);
});

test("rounding retains cent totals and header-only records can reconstruct gross sales", () => {
  assert.deepEqual(salesReportAmounts({ subtotal: 1000, totalAmount: 800, discountAmount: 200 }), { grossSales: 1000, discounts: 200, netSales: 800 });
  assert.deepEqual(salesReportAmounts({ lineTotal: 17.99, grossLineTotal: 19.99, discountAmount: 2 }), { grossSales: 19.99, discounts: 2, netSales: 17.99 });
});
