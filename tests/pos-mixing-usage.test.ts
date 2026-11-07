import test from "node:test";
import assert from "node:assert/strict";
import { isProductionCost, isSellingExpense, isOperatingExpense, productUsage } from "../lib/product-usage";
import { calculateProductionBatchCost } from "../lib/production-costing";

test("product usage classification separates production costs, selling expenses, and operating expenses", () => {
  // Production Cost
  assert.equal(isProductionCost("PRODUCTION_COST"), true);
  assert.equal(isProductionCost("PRODUCTION_OVERHEAD"), true);
  assert.equal(isProductionCost("UNASSIGNED"), true);
  assert.equal(isProductionCost("SELLING_EXPENSE"), false);
  assert.equal(isProductionCost("OPERATING_EXPENSE"), false);

  // Selling Expense
  assert.equal(isSellingExpense("SELLING_EXPENSE"), true);
  assert.equal(isSellingExpense("PRODUCTION_COST"), false);
  assert.equal(isSellingExpense("OPERATING_EXPENSE"), false);

  // Operating Expense
  assert.equal(isOperatingExpense("OPERATING_EXPENSE"), true);
  assert.equal(isOperatingExpense("PRODUCTION_COST"), false);
  assert.equal(isOperatingExpense("SELLING_EXPENSE"), false);
});

test("production mixing calculation correctly isolates production costs from period expenses", () => {
  const batchIngredients = [
    { name: "CHICKEN HEADS", usage: "PRODUCTION_COST", quantity: 2, unitCost: 168 },
    { name: "BREADING MIX", usage: "PRODUCTION_COST", quantity: 1, unitCost: 50 },
    { name: "PAPER BAG 10x12", usage: "SELLING_EXPENSE", quantity: 50, unitCost: 0.50 },
    { name: "FOOD GLOVES", usage: "OPERATING_EXPENSE", quantity: 2, unitCost: 5.00 },
  ];

  const productionIngredients = batchIngredients.filter((i) => isProductionCost(i.usage));
  const sellingExpenseIngredients = batchIngredients.filter((i) => isSellingExpense(i.usage));
  const operatingExpenseIngredients = batchIngredients.filter((i) => isOperatingExpense(i.usage));

  const outputQty = 50;

  // Costing only uses production ingredients
  const costing = calculateProductionBatchCost({
    ingredients: productionIngredients.map((i, idx) => ({
      inventoryId: `inv-${idx}`,
      quantity: i.quantity,
      unitCost: i.unitCost,
    })),
    outputQty,
  });

  // 2 * 168 (336) + 1 * 50 (50) = 386 total production cost
  assert.equal(costing.totalBatchCost, 386);
  // 386 / 50 = 7.72 per piece
  assert.equal(costing.producedUnitCost, 7.72);

  // Selling expense calculation (50 * 0.50 = 25)
  const totalSellingExpense = sellingExpenseIngredients.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
  assert.equal(totalSellingExpense, 25);

  // Operating expense calculation (2 * 5.00 = 10)
  const totalOperatingExpense = operatingExpenseIngredients.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
  assert.equal(totalOperatingExpense, 10);

  // Verify that selling and operating expenses did NOT inflate the output product's unit cost
  const inflatedCost = (386 + 25 + 10) / outputQty; // 8.42
  assert.notEqual(costing.producedUnitCost, inflatedCost);
  assert.equal(costing.producedUnitCost < inflatedCost, true);
});

test("in-row mixing items correctly aggregate valid rows and calculate line subtotals", () => {
  const inventoryMock = [
    { id: "inv-1", productName: "WHOLE CHICKEN", buyingPrice: 175, usage: "PRODUCTION_COST" },
    { id: "inv-2", productName: "BREADING FLOUR", buyingPrice: 45, usage: "PRODUCTION_COST" },
    { id: "inv-3", productName: "TAKE-OUT PAPER BAG", buyingPrice: 0.75, usage: "SELLING_EXPENSE" },
  ];

  const mixRows = [
    { inventoryId: "inv-1", quantity: "2" },
    { inventoryId: "inv-2", quantity: "1.5" },
    { inventoryId: "", quantity: "1" }, // Incomplete row should be ignored
    { inventoryId: "inv-3", quantity: "20" },
  ];

  const activeRows = mixRows
    .filter((r) => Boolean(r.inventoryId))
    .map((r) => {
      const inv = inventoryMock.find((i) => i.id === r.inventoryId)!;
      const qty = Number(r.quantity) || 0;
      const subtotal = Math.round(inv.buyingPrice * qty * 100) / 100;
      return { ...r, ...inv, qty, subtotal };
    });

  assert.equal(activeRows.length, 3);
  assert.equal(activeRows[0].subtotal, 350); // 175 * 2
  assert.equal(activeRows[1].subtotal, 67.5); // 45 * 1.5
  assert.equal(activeRows[2].subtotal, 15); // 0.75 * 20

  const totalBatch = activeRows.reduce((sum, r) => sum + r.subtotal, 0);
  assert.equal(totalBatch, 432.5);
});

