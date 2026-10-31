import assert from "node:assert/strict";
import test from "node:test";
import { purchaseBatchSummaries } from "../lib/purchase-batch-summary";

test("purchase summaries distinguish product lines from purchased quantities", () => {
  const summaries = purchaseBatchSummaries([
    { purchaseBatchId: "a", productName: "OIL" },
    { purchaseBatchId: "a", productName: "FLOUR" },
    { purchaseBatchId: "b", productName: "RICE" },
    { purchaseBatchId: "a", productName: "OIL" },
  ]);
  assert.deepEqual(summaries.get("a"), { productNames: ["OIL", "FLOUR"], lineCount: 3 });
  assert.deepEqual(summaries.get("b"), { productNames: ["RICE"], lineCount: 1 });
  assert.equal(summaries.get("other"), undefined);
});

test("purchase summaries handle legacy blank names without inventing data", () => {
  assert.equal(purchaseBatchSummaries([]).size, 0);
  assert.deepEqual(purchaseBatchSummaries([{ purchaseBatchId: "a", productName: "" }]).get("a"), { productNames: [], lineCount: 1 });
});
