import test from "node:test";
import assert from "node:assert/strict";

import { outletCashSummary } from "@/lib/employee-finance";

test("cash sale expenses deduct from cash drawer while period expenses only deduct from net profit", () => {
  const dailyRevenue = 5000;
  const dailyCogs = 2000;

  // 1. Cash sale expense (e.g. ice, errand tricycle fare) -> deducts from cash sales & drawer
  const cashSaleExpenses = 300;

  // 2. Period expense (e.g. monthly electricity, salaries, rent, mixing supplies) -> does NOT deduct from cash drawer
  const periodExpenses = 1200;

  const totalExpenses = cashSaleExpenses + periodExpenses; // 1500

  // Cash movement (Drawer collection)
  const cashMovement = outletCashSummary(dailyRevenue, 0, cashSaleExpenses, 0);
  assert.equal(cashMovement.cashSales, 5000);
  assert.equal(cashMovement.expenses, 300);
  assert.equal(cashMovement.netCashMovement, 4700); // Only cashSaleExpenses reduced the drawer

  // Net Profit / P&L (Whole day / month profit)
  const grossProfit = dailyRevenue - dailyCogs; // 3000
  const netProfit = dailyRevenue - dailyCogs - totalExpenses; // 5000 - 2000 - 1500 = 1500
  assert.equal(grossProfit, 3000);
  assert.equal(netProfit, 1500); // Both cash drawer expenses and period expenses reduce net profit
});

test("expense deduction nature distinction separates cash register payouts from store overhead", () => {
  const expenses = [
    { name: "2 bags tube ice", amount: 100, deductFromCashSale: true, expenseNature: "CASH_SALE_EXPENSE" },
    { name: "Market garlic and onions", amount: 250, deductFromCashSale: true, expenseNature: "CASH_SALE_EXPENSE" },
    { name: "Store electricity bill", amount: 3500, deductFromCashSale: false, expenseNature: "PERIOD_EXPENSE" },
    { name: "Staff weekly wages", amount: 4000, deductFromCashSale: false, expenseNature: "PERIOD_EXPENSE" },
    { name: "Dishwashing liquid (Mixing usage)", amount: 89, deductFromCashSale: false, expenseNature: "PERIOD_EXPENSE" },
  ];

  const cashExpenses = expenses
    .filter((e) => e.deductFromCashSale !== false)
    .reduce((sum, e) => sum + e.amount, 0);

  const periodExpenses = expenses
    .filter((e) => e.deductFromCashSale === false)
    .reduce((sum, e) => sum + e.amount, 0);

  const totalExpenses = cashExpenses + periodExpenses;

  assert.equal(cashExpenses, 350); // 100 + 250
  assert.equal(periodExpenses, 7589); // 3500 + 4000 + 89
  assert.equal(totalExpenses, 7939);
});

