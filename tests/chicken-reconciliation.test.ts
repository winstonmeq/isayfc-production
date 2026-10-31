import assert from "node:assert/strict";
import test from "node:test";
import { reconcileChickenKilos } from "../lib/chicken-reconciliation";

const start = new Date("2026-10-30T16:00:00Z");
const end = new Date("2026-10-31T16:00:00Z");

test("slicing then void then slicing again cancels original and reversal exactly once", () => {
  const result = reconcileChickenKilos(0, [
    { transactionDate: "2026-10-31T00:00:00Z", previousStock: 0, newStock: 14, kilos: 15, referenceType: "DELIVERY" },
    { transactionDate: "2026-10-31T01:00:00Z", previousStock: 14, newStock: 0, kilos: 15, referenceType: "SLICING_BATCH", sourceVoided: true },
    { transactionDate: "2026-10-31T02:00:00Z", previousStock: 0, newStock: 14, kilos: 15, referenceType: "SLICING_VOID" },
    { transactionDate: "2026-10-31T03:00:00Z", previousStock: 14, newStock: 0, kilos: 15, referenceType: "SLICING_BATCH" },
  ], start, end);
  assert.deepEqual(result, { opening: 0, closing: 0, other: 0, incomplete: false });
  assert.equal(result.opening + 15 + result.other - 15 - result.closing, 0);
});

test("a later-day void preserves historical stock balances", () => {
  const result = reconcileChickenKilos(15, [
    { transactionDate: "2026-10-31T00:00:00Z", previousStock: 0, newStock: 14, kilos: 15, referenceType: "DELIVERY" },
    { transactionDate: "2026-10-31T01:00:00Z", previousStock: 14, newStock: 0, kilos: 15, referenceType: "SLICING_BATCH", sourceVoided: true },
    { transactionDate: "2026-11-01T00:00:00Z", previousStock: 0, newStock: 14, kilos: 15, referenceType: "SLICING_VOID" },
  ], start, end);
  assert.deepEqual(result, { opening: 0, closing: 0, other: -15, incomplete: false });
});

test("voided delivery and its reversal net out without hiding real adjustments", () => {
  const result = reconcileChickenKilos(2, [
    { transactionDate: "2026-10-31T00:00:00Z", previousStock: 0, newStock: 14, kilos: 15, referenceType: "DELIVERY", sourceVoided: true },
    { transactionDate: "2026-10-31T01:00:00Z", previousStock: 14, newStock: 0, kilos: 15, referenceType: "DELIVERY_VOID" },
    { transactionDate: "2026-10-31T02:00:00Z", previousStock: 0, newStock: 2, kilos: 2, referenceType: "INVENTORY_ADJUSTMENT" },
  ], start, end);
  assert.equal(result.other, 2);
  assert.equal(result.opening, 0);
});
test("reconciles received kilos and slicing separately from heads, rewinding later movements", () => {
  const result = reconcileChickenKilos(15, [
    { transactionDate: "2026-10-31T00:00:00Z", previousStock: 0, newStock: 14, kilos: 15, referenceType: "DELIVERY" },
    { transactionDate: "2026-10-31T01:00:00Z", previousStock: 14, newStock: 0, kilos: 15, referenceType: "SLICING_BATCH" },
    { transactionDate: "2026-11-01T00:00:00Z", previousStock: 0, newStock: 15, kilos: 15, referenceType: "DELIVERY" },
  ], start, end);
  assert.deepEqual(result, { opening: 0, closing: 0, other: 0, incomplete: false });
});
test("preserves opening stock, remaining stock and signed other stock out", () => {
  const result = reconcileChickenKilos(5, [
    { transactionDate: "2026-10-31T00:00:00Z", previousStock: 10, newStock: 30, kilos: 20, referenceType: "DELIVERY" },
    { transactionDate: "2026-10-31T01:00:00Z", previousStock: 30, newStock: 10, kilos: 20, referenceType: "SLICING_BATCH" },
    { transactionDate: "2026-10-31T02:00:00Z", previousStock: 10, newStock: 5, kilos: 5, referenceType: "SALE" },
  ], start, end);
  assert.deepEqual(result, { opening: 10, closing: 5, other: -5, incomplete: false });
});
test("flags missing movement weights rather than assuming balanced kilos", () => {
  const result = reconcileChickenKilos(0, [
    { transactionDate: "2026-10-31T00:00:00Z", previousStock: 5, newStock: 0, referenceType: "SALE" },
  ], start, end);
  assert.equal(result.incomplete, true);
});
