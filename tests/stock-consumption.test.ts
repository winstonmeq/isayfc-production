import test from "node:test";
import assert from "node:assert/strict";
import Expense from "../models/Expense";
import { stockConsumptionCost, stockConsumptionType } from "../lib/stock-consumption";
import { outletCashSummary } from "../lib/employee-finance";
import { buildOverallBusinessReport } from "../lib/overall-business-report";

test("stock usage expenses only allow selling/operating supplies, not production ingredients or overhead", () => {
  assert.equal(stockConsumptionType("SELLING_EXPENSE"), "SELLING_EXPENSES");
  assert.equal(stockConsumptionType("OPERATING_EXPENSE"), "OPERATING_EXPENSES");
  for (const usage of [undefined, "UNASSIGNED", "PRODUCTION_COST", "PRODUCTION_OVERHEAD", "RETAIL_RESALE"]) assert.equal(stockConsumptionType(usage), null);
});

test("consumption uses base quantities and saved costs, and keeps company markup separate", () => {
  const item = { stockQty: 500, unitLabel: "PCS", packSize: 100, buyingPrice: 200, companyUnitCost: 1.5 };
  assert.deepEqual(stockConsumptionCost(item, 20), { unitCost: 2, amount: 40, companyAmount: 30, newStock: 480 });
  assert.deepEqual(stockConsumptionCost({ ...item, stockQty: 10, unitLabel: "KG", packSize: 0, buyingPrice: 80 }, 0.25), { unitCost: 80, amount: 20, companyAmount: 0.38, newStock: 9.75 });
  for (const qty of [0, -1, 501, 1.5, NaN, Infinity]) assert.throws(() => stockConsumptionCost(item, qty));
  assert.throws(() => stockConsumptionCost({ ...item, companyUnitCost: undefined }, 20));
});

test("stock usage reduces profit but not drawer cash; overall uses original company cost", async () => {
  const expense = new Expense({ name: "Cellophane", expenseCategory: "OUTLET", origin: "STOCK_USAGE", type: "SELLING_EXPENSES", amount: 40, companyAmount: 30, deductFromCashSale: false, expenseNature: "PERIOD_EXPENSE", consumedQuantity: 20, consumptionUnit: "PCS", consumptionUnitCost: 2 });
  await expense.validate();
  assert.equal(expense.deductFromCashSale, false);
  assert.equal(expense.consumedQuantity, 20);
  const cash = outletCashSummary(500, 0, 0, 0);
  assert.equal(cash.netCashMovement, 500);
  const report = buildOverallBusinessReport([], [], [{ id: "consumption", date: "2026-11-07T00:00:00Z", outletId: "a", name: "Cellophane", type: "SELLING_EXPENSES", amount: 40, companyAmount: 30, origin: "STOCK_USAGE" }], [{ id: "a", name: "Outlet A" }]);
  assert.equal(report.totals.operatingExpenses, 30);
  assert.equal(report.totals.netProfit, -30);
});
