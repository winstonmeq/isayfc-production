import assert from "node:assert/strict";
import test from "node:test";
import { menuStock, outletExpenseDay, recognizedSaleRange, reportOutletDirectory, validIngredientQuantity } from "../lib/business-flow";
import { calculateProductionBatchCost } from "../lib/production-costing";

test("same-name raw stock is never sellable as finished menu stock", () => {
  const raw = { productId: "raw-c10", productName: "CHICKEN", stockQty: 50 };
  assert.equal(menuStock([raw], "menu-chicken"), undefined);
  const finished = { productId: "menu-chicken", productName: "CHICKEN", stockQty: 20 };
  assert.equal(menuStock([raw, finished], "menu-chicken"), finished);
});

test("fractional measured ingredients carry complete batch cost; pieces remain whole", () => {
  assert.equal(validIngredientQuantity(0.5, "KG"), true);
  assert.equal(validIngredientQuantity(0.25, "QTY"), true);
  for (const unit of ["HEAD", "PCS"]) assert.equal(validIngredientQuantity(0.5, unit), false);
  for (const quantity of [0, -1, NaN, Infinity]) assert.equal(validIngredientQuantity(quantity, "KG"), false);
  const batch = calculateProductionBatchCost({ ingredients: [
    { inventoryId: "chicken", quantity: 10, unitCost: 8 },
    { inventoryId: "flour", quantity: 0.5, unitCost: 40 },
    { inventoryId: "oil", quantity: 0.25, unitCost: 80 },
  ], outputQty: 10 });
  assert.equal(batch.totalBatchCost, 120);
  assert.equal(batch.producedUnitCost, 12);
  assert.throws(() => calculateProductionBatchCost({ ingredients: [{ inventoryId: "flour", quantity: 0.5, unitCost: 40 }], outputQty: 0.5 }));
});

test("late expenses use selected Manila day, with invalid/future dates rejected", () => {
  const now = new Date("2026-11-02T01:00:00Z");
  assert.equal(outletExpenseDay("2026-10-31", now)?.toISOString(), "2026-10-30T16:00:00.000Z");
  assert.equal(outletExpenseDay(undefined, now)?.toISOString(), "2026-11-01T16:00:00.000Z");
  assert.equal(outletExpenseDay("2026-02-30", now), null);
  assert.equal(outletExpenseDay("2026-11-03", now), null);
  assert.equal(outletExpenseDay("", now), null);
});

test("main reports select recognition date with a legacy sale-date fallback", () => {
  const start = new Date("2026-10-31T16:00:00Z"), end = new Date("2026-11-30T16:00:00Z");
  assert.deepEqual(recognizedSaleRange(start, end), { $and: [
    { $gte: [{ $ifNull: ["$recognizedAt", "$saleDate"] }, start] },
    { $lt: [{ $ifNull: ["$recognizedAt", "$saleDate"] }, end] },
  ] });
});

test("historical directory retains inactive, deleted and expense-only outlets", () => {
  const directory = reportOutletDirectory([{ _id: "closed", name: "Closed Store", code: "C" }], ["closed", "deleted"], ["expense-only", ""]);
  assert.deepEqual(directory.map((row) => String(row._id)), ["closed", "deleted", "expense-only", ""]);
  assert.equal(directory[0].name, "Closed Store");
  assert.equal(directory[1].name, "Deleted outlet");
});
