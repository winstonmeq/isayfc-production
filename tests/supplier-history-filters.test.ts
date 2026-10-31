import assert from "node:assert/strict";
import test from "node:test";
import { supplierHistoryFilters } from "../lib/supplier-history-filters";

test("supplier history date filters use Manila day boundaries", () => {
  const result = supplierHistoryFilters(new URLSearchParams({ dateFrom: "2026-10-31", dateTo: "2026-10-31", page: "2" }), "paymentDate");
  const range = result.filter.paymentDate as { $gte: Date; $lt: Date };
  assert.equal(range.$gte.toISOString(), "2026-10-30T16:00:00.000Z");
  assert.equal(range.$lt.toISOString(), "2026-10-31T16:00:00.000Z");
  assert.equal(result.page, 2);
});
test("rejects invalid suppliers, dates and reversed ranges", () => {
  const cases: Record<string, string>[] = [{ supplierId: "invalid" }, { dateFrom: "2026-02-30" }, { dateFrom: "2026-11-01", dateTo: "2026-10-31" }];
  for (const input of cases) {
    assert.throws(() => supplierHistoryFilters(new URLSearchParams(input), "invoiceDate"));
  }
});
