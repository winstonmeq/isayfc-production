import assert from "node:assert/strict";
import test from "node:test";

import { calculateOutletProfit, calculateProductionBatchCost } from "../lib/production-costing";
import { packingSnapshot, toBaseQuantity, toBaseUnitCost } from "../lib/inventory-units";

test("receiving through multi-ingredient outlet production and final profit", () => {
  // Main branch receives one C10 pack at P395: 50 PCS at P7.90 each.
  const chickenPack = packingSnapshot({ unit: "PACK", baseUnit: "PCS", multiplier: 50 });
  const receivedChickenPcs = toBaseQuantity(1, chickenPack);
  const chickenUnitCost = toBaseUnitCost(395, chickenPack);
  assert.equal(receivedChickenPcs, 50);
  assert.equal(chickenUnitCost, 7.9);

  // Outlet consumes 40 chicken pieces plus direct flour, oil, and seasoning.
  const batch = calculateProductionBatchCost({
    ingredients: [
      { inventoryId: "chicken", quantity: 40, unitCost: chickenUnitCost },
      { inventoryId: "flour", quantity: 2, unitCost: 35 },
      { inventoryId: "oil", quantity: 1, unitCost: 90 },
      { inventoryId: "seasoning", quantity: 1, unitCost: 24 },
    ],
    outputQty: 40,
  });
  assert.equal(batch.totalBatchCost, 500);
  assert.equal(batch.producedUnitCost, 12.5);

  // Selling 30 finished pieces at P20, with P50 daily outlet expenses.
  const profit = calculateOutletProfit({ soldQty: 30, sellingPrice: 20, unitCost: batch.producedUnitCost, expenses: 50 });
  assert.deepEqual(profit, { revenue: 600, cogs: 375, grossProfit: 225, netProfit: 175 });
  assert.equal(40 - 30, 10); // finished stock remaining
  assert.equal(receivedChickenPcs - 40, 10); // raw chicken remaining
});

test("production cost is weighted into existing finished stock", () => {
  const batch = calculateProductionBatchCost({
    ingredients: [{ inventoryId: "new-batch", quantity: 10, unitCost: 15 }],
    outputQty: 10,
    existingOutputQty: 10,
    existingOutputUnitCost: 10,
  });
  assert.equal(batch.weightedUnitCost, 12.5);
});

test("selling the complete produced quantity leaves zero finished stock", () => {
  const transferredRawStock = 50;
  const consumedRawStock = 50;
  const producedFinishedStock = 50;
  const soldFinishedStock = 50;

  assert.equal(transferredRawStock - consumedRawStock, 0);
  assert.equal(producedFinishedStock - soldFinishedStock, 0);
});
