import test from "node:test";
import assert from "node:assert/strict";
import { outletDirectorySummary } from "../lib/outlet-directory-summary";
test("outlet directory separates gross/net sales and historical cost", () => {
  const rows = outletDirectorySummary(["A", "B"], [{ _id: "s", outletId: "A", totalAmount: 180, discountAmount: 20 }], [{ saleId: "s", qty: 2, baseQty: 100, unitCost: 1, lineTotal: 180, discountAmount: 20 }], [{ outletId: "A", amount: 30 }]);
  assert.deepEqual(rows.get("A"), { grossSales: 200, discounts: 20, cogs: 100, netSales: 180, expenses: 30, netProfit: 50 });
  assert.equal(rows.get("B")?.netProfit, 0);
});
test("summary does not include unauthorized outlets or treat COGS as a sales deduction", () => {
  const rows = outletDirectorySummary(["A"], [{ _id: "x", outletId: "B", totalAmount: 900 }], [], [{ outletId: "B", amount: 50 }]);
  assert.equal(rows.get("A")?.netSales, 0);
  assert.equal(rows.has("B"), false);
});
