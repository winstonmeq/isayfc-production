import test from "node:test";
import assert from "node:assert/strict";
import { deliveryExpenseKey, ownerDeliveryExpenseTotals } from "../lib/outlet-delivery-expense-policy";
import { buildOverallBusinessReport } from "../lib/overall-business-report";

test("delivery expenses use saved marked-up line totals, grouped by main inventory category", () => {
  assert.deepEqual(ownerDeliveryExpenseTotals([
    { source: "CHICKEN", lineTotal: 1185 }, // 3 packs at 395, not 150 pieces at 395
    { source: "BODEGA", lineTotal: 550 },
    { source: "CHICKEN", lineTotal: 90 }, // saved discounted amount
  ]), [{ expenseCategory: "BODEGA", amount: 1275 }, { expenseCategory: "GROCERY", amount: 550 }]);
  assert.equal(deliveryExpenseKey("delivery-a", "BODEGA"), deliveryExpenseKey("delivery-a", "BODEGA"));
  assert.notEqual(deliveryExpenseKey("delivery-a", "BODEGA"), deliveryExpenseKey("delivery-a", "GROCERY"));
  assert.throws(() => ownerDeliveryExpenseTotals([]));
  assert.throws(() => ownerDeliveryExpenseTotals([{ source: "CHICKEN", lineTotal: NaN }]));
  assert.throws(() => ownerDeliveryExpenseTotals([{ source: "OUTLET", lineTotal: 20 }]));
});

test("overall eliminates regular owner-customer sales AND their automatic main expenses", () => {
  const date = "2026-11-01T08:00:00Z";
  const result = buildOverallBusinessReport([
    { id: "delivery", date, customer: "Outlet A", ownerOutletId: "a", source: "CHICKEN", transactionType: "EXTERNAL_SALE", totalAmount: 500 },
    { id: "retail", date, customer: "Walk-in", outletId: "a", source: "OUTLET", totalAmount: 1000 },
  ], [{ saleId: "delivery", baseQty: 50, unitCost: 6 }, { saleId: "retail", baseQty: 50, unitCost: 10, companyUnitCost: 6 }], [
    { id: "auto", date, name: "Outlet delivery", type: "OWNER_OUTLET_DELIVERY", origin: "OWNER_OUTLET_DELIVERY", amount: 500, expenseCategory: "BODEGA" },
    { id: "fuel", date, name: "Fuel", type: "FUEL", amount: 20, expenseCategory: "BODEGA" },
  ], [{ id: "a", name: "Outlet A" }]);
  assert.equal(result.totals.netSales, 1000);
  assert.equal(result.totals.cogs, 300);
  assert.equal(result.totals.operatingExpenses, 20);
  assert.equal(result.totals.netProfit, 680);
  assert.equal(result.expenseRows.length, 1);
});
