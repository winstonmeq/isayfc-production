import test from "node:test";
import assert from "node:assert/strict";
import { incomeStockRollForward } from "../lib/income-stock-roll-forward";
const day = (date: string) => new Date(`${date}T00:00:00+08:00`);
const move = (date: string, previousStock: number, newStock: number, referenceType: string) => ({ transactionDate: day(date), previousStock, newStock, referenceType });

test("grocery purchased within month has zero beginning, receipts and correct ending", () => {
  assert.deepEqual(incomeStockRollForward(9, [move("2026-11-08", 0, 10, "PURCHASE_BATCH"), move("2026-11-08", 10, 9, "SALE")], day("2026-11-01"), day("2026-12-01"), 1), { beginning: 0, received: 10, processed: 0, otherNet: 0, ending: 9 });
});
test("yesterday ending becomes today's beginning; same-month purchases are not opening stock", () => {
  const rows = [move("2026-11-08", 10, 15, "PURCHASE_BATCH"), move("2026-11-08", 15, 12, "SALE"), move("2026-11-09", 12, 10, "SALE")];
  const yesterday = incomeStockRollForward(10, rows, day("2026-11-08"), day("2026-11-09"), 3);
  const today = incomeStockRollForward(10, rows, day("2026-11-09"), day("2026-11-10"), 2);
  assert.equal(yesterday.beginning, 10); assert.equal(yesterday.ending, 12);
  assert.equal(today.beginning, yesterday.ending); assert.equal(today.ending, 10);
});
test("month ending carries into next month and ignores later receipts in historical closing", () => {
  const rows = [move("2026-11-30", 10, 8, "SALE"), move("2026-12-01", 8, 13, "PURCHASE_BATCH")];
  assert.equal(incomeStockRollForward(13, rows, day("2026-11-01"), day("2026-12-01"), 2).ending, 8);
  assert.equal(incomeStockRollForward(13, rows, day("2026-12-01"), day("2027-01-01"), 0).beginning, 8);
});
test("receiving, slicing, returns, production usage and reversals reconcile without changing COGS", () => {
  const rows = [move("2026-11-08", 0, 10, "DELIVERY"), move("2026-11-08", 10, 8, "SALE"), move("2026-11-08", 8, 6, "MAIN_PRODUCTION"), move("2026-11-08", 6, 7, "CUSTOMER_RETURN"), move("2026-11-08", 7, 17, "SLICING_BATCH"), move("2026-11-08", 17, 7, "VOID_REVERSAL")];
  const value = incomeStockRollForward(7, rows, day("2026-11-01"), day("2026-12-01"), 2);
  assert.equal(value.processed, 10); assert.equal(value.otherNet, -11);
  assert.equal(value.beginning + value.received + value.processed + value.otherNet - 2, value.ending);
});
test("fractional grocery quantities and exact Manila boundaries remain accurate", () => {
  const value = incomeStockRollForward(1.25, [move("2026-11-08", 0.5, 1.5, "PURCHASE_BATCH"), move("2026-11-08", 1.5, 1.25, "SALE")], day("2026-11-08"), day("2026-11-09"), 0.25);
  assert.equal(value.beginning, 0.5); assert.equal(value.received, 1); assert.equal(value.otherNet, 0);
});
