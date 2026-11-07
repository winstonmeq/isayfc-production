import test from "node:test";
import assert from "node:assert/strict";
import { inventoryAsOf, stockBeforeCutoff } from "../lib/inventory-as-of";

const now = new Date("2026-11-08T04:00:00Z");
test("today defaults to live inventory", () => {
  const snapshot = inventoryAsOf(null, now);
  assert.equal(snapshot.date, "2026-11-08");
  assert.equal(snapshot.historical, false);
  assert.equal(snapshot.cutoff, now);
});
test("historical date ends at next midnight in Manila", () => {
  assert.equal(inventoryAsOf("2026-11-07", now).cutoff.toISOString(), "2026-11-07T16:00:00.000Z");
});
test("invalid and future dates are rejected", () => {
  for (const date of ["2026-11-09", "2026-02-30", "invalid"]) assert.throws(() => inventoryAsOf(date, now));
});
test("later receipts, sales and reversals are removed from current balance", () => {
  assert.equal(stockBeforeCutoff(13, [
    { previousStock: 10, newStock: 15 },
    { previousStock: 15, newStock: 12 },
    { previousStock: 12, newStock: 13 },
  ]), 10);
  assert.equal(stockBeforeCutoff(1.3, [{ previousStock: 1.1, newStock: 1.3 }]), 1.1);
});
