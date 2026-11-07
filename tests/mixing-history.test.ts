import test from "node:test";
import assert from "node:assert/strict";
import { mixingBatchDetails } from "../lib/mixing-history";

test("mixing history uses saved costs and retains every input and output", () => {
  const batch = mixingBatchDetails("abc", [
    { type: "REPACK_OUT", productName: "Chicken", quantity: 50, unitCost: 5.43, baseUnit: "PCS" },
    { type: "REPACK_OUT", productName: "Oil", quantity: 0.5, unitCost: 100, baseUnit: "QTY" },
    { type: "REPACK_IN", productName: "Buttered", quantity: 40, unitCost: 7, baseUnit: "QTY", createdBy: { name: "Cashier" }, sourceChannel: "WEB" },
    { type: "REPACK_IN", productName: "Other output", quantity: 5, unitCost: 8.3, baseUnit: "PCS" },
  ]);
  assert.equal(batch.inputs.length, 2);
  assert.equal(batch.outputs.length, 2);
  assert.equal(batch.consumedCost, 321.5);
  assert.equal(batch.productionCost, 321.5);
  assert.equal(batch.createdBy, "Cashier");
  assert.equal(batch.outputs[1].unit, "PCS");
});

test("batch cost rounds once and does not equate expensed supplies with capitalized cost", () => {
  const batch = mixingBatchDetails("legacy", [
    { type: "REPACK_OUT", productName: "Supply", quantity: 1, unitCost: 10 },
    { type: "REPACK_IN", productName: "Output", quantity: 3, unitCost: 0.333333 },
  ]);
  assert.equal(batch.productionCost, 1);
  assert.equal(batch.consumedCost, 10);
  assert.equal(batch.createdBy, "Unknown / legacy");
  assert.equal(batch.outputs[0].unit, "QTY");
});
