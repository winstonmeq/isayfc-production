import test from "node:test";
import assert from "node:assert/strict";
import { buildOverallBusinessReport, overallLineCost, overallSalesFilter, type OverallSale } from "../lib/overall-business-report";

const date = "2026-11-01T08:00:00Z";
const sale = (extra: Partial<OverallSale>): OverallSale => ({ id: "sale", date, customer: "Walk-in", ...extra });
const outlets = [{ id: "a", name: "Outlet A" }];

test("regular owner-outlet customer sales and marked-up automatic expenses are both eliminated", () => {
  const report = buildOverallBusinessReport([
    sale({ id: "delivery", source: "CHICKEN", transactionType: "EXTERNAL_SALE", ownerOutletId: "a", totalAmount: 1700 }),
    sale({ id: "retail", source: "OUTLET", outletId: "a", totalAmount: 1200 }),
  ], [
    { saleId: "delivery", baseQty: 10, unitCost: 150 },
    { saleId: "retail", baseQty: 6, unitCost: 170, companyUnitCost: 150 },
  ], [
    { id: "automatic", date, name: "Received delivery", type: "OTHER", origin: "OWNER_OUTLET_DELIVERY", amount: 1700, expenseCategory: "BODEGA" },
    { id: "cash", date, name: "Power", type: "OTHER", amount: 100, outletId: "a" },
  ], outlets);
  assert.equal(report.totals.netSales, 1200);
  assert.equal(report.totals.cogs, 900);
  assert.equal(report.totals.operatingExpenses, 100);
  assert.equal(report.totals.netProfit, 200);
  assert.equal(report.rows.length, 1);
  assert.equal(report.expenseRows.length, 1);
});

test("overall income eliminates allocations and markup, recognizing only cost of goods actually sold", () => {
  const report = buildOverallBusinessReport([
    sale({ id: "allocation", transactionType: "INTERNAL_TRANSFER", source: "CHICKEN", totalAmount: 1700 }),
    sale({ id: "retail", source: "OUTLET", outletId: "a", totalAmount: 1200 }),
  ], [
    { saleId: "allocation", qty: 10, unitCost: 150 },
    { saleId: "retail", qty: 6, baseQty: 6, unitCost: 170, companyUnitCost: 150 },
  ], [{ id: "expense", date, name: "Utilities", type: "UTILITIES", amount: 100, outletId: "a", expenseCategory: "OUTLET" }], outlets);
  assert.equal(report.totals.transactions, 1);
  assert.equal(report.mainSales, 0);
  assert.equal(report.outletSales, 1200);
  assert.equal(report.totals.cogs, 900); // Four unsold chickens remain inventory, not an allocation expense.
  assert.equal(report.totals.grossProfit, 300);
  assert.equal(report.totals.netProfit, 200);
  assert.equal(report.rows.some((row) => row.id === "allocation"), false);
});

test("combines discounted main sales with outlet sales and includes expense-only outlets", () => {
  const report = buildOverallBusinessReport([
    sale({ id: "main", source: "CHICKEN", subtotal: 300, discountAmount: 20, totalAmount: 280 }),
    sale({ id: "outlet", source: "OUTLET", outletId: "a", totalAmount: 400 }),
  ], [{ saleId: "main", baseQty: 2, unitCost: 100 }, { saleId: "outlet", baseQty: 4, unitCost: 80, companyUnitCost: 60 }], [
    { id: "main-expense", date, name: "Office", type: "OFFICE", amount: 30 },
    { id: "outlet-expense", date, name: "Power", type: "POWER", amount: 40, outletId: "b", expenseCategory: "OUTLET" },
  ], [...outlets, { id: "b", name: "Outlet B" }]);
  assert.equal(report.totals.grossSales, 700);
  assert.equal(report.totals.discounts, 20);
  assert.equal(report.totals.netSales, 680);
  assert.equal(report.totals.cogs, 440);
  assert.equal(report.totals.operatingExpenses, 70);
  assert.equal(report.totals.netProfit, 170);
  assert.equal(report.branches.find((branch) => branch.id === "b")?.netProfit, -40);
  assert.equal(report.branches.reduce((sum, branch) => sum + Number(branch.netProfit), 0), report.totals.netProfit);
});

test("missing original outlet cost withholds final profit instead of substituting marked-up branch cost", () => {
  const report = buildOverallBusinessReport([sale({ source: "OUTLET", outletId: "a", totalAmount: 100 })], [{ saleId: "sale", qty: 1, unitCost: 70 }], [], outlets);
  assert.equal(report.totals.missingCostLines, 1);
  assert.equal(report.totals.cogs, null);
  assert.equal(report.totals.netProfit, null);
  assert.equal(overallLineCost({ saleId: "sale", qty: 1, companyUnitCost: 0 }, true), 0);
  assert.equal(overallLineCost({ saleId: "sale", qty: -1, companyUnitCost: 5 }, true), null);
});

test("legacy mobile origin and expense tags retain their outlet without mixing into main", () => {
  const id = "6aa7a0883c5e638fb0a464fa";
  const report = buildOverallBusinessReport([sale({ receiptNumber: "MOB-123", remarks: `MOBILE SALE OUTLET:${id}`, totalAmount: 20 })], [{ saleId: "sale", qty: 2, companyUnitCost: 4 }], [
    { id: "legacy", date, name: "Fuel", type: "FUEL", amount: 5, remarks: `MOBILE EXPENSE OUTLET:${id}` },
    { id: "unknown", date, name: "Unassigned", type: "OTHER", amount: 1, expenseCategory: "OUTLET" },
  ], [{ id, name: "Closed Outlet" }]);
  assert.equal(report.rows[0].branchId, id);
  assert.equal(report.branches.find((branch) => branch.id === id)?.netProfit, 7);
  assert.equal(report.branches.find((branch) => branch.id === "UNASSIGNED")?.operatingExpenses, 1);
  assert.equal(report.branches.find((branch) => branch.id === "MAIN")?.operatingExpenses, 0);
});

test("date scope excludes pending and voided receipts, matching main recognition and outlet sale day", () => {
  const filter = overallSalesFilter(new Date(date), new Date("2026-11-02T08:00:00Z"));
  assert.equal(filter.isVoided, false);
  assert.equal(filter.fulfillmentStatus.$ne, "PENDING");
  const text = JSON.stringify(filter);
  assert.match(text, /INTERNAL_TRANSFER/);
  assert.match(text, /recognizedAt/);
  assert.match(text, /saleDate/);
});

test("a fully discounted or header-only sale cannot conceal unknown COGS", () => {
  const report = buildOverallBusinessReport([sale({ totalAmount: 0, subtotal: 100, discountAmount: 100 })], [], [], []);
  assert.equal(report.totals.grossSales, 100);
  assert.equal(report.totals.netSales, 0);
  assert.equal(report.totals.netProfit, null);
});
