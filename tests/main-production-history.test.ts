import test from "node:test";
import assert from "node:assert/strict";
import { mainProductionHistoryQuery } from "../lib/main-production-history";

test("main mixing history defaults to 25 and supports paging beyond 1000 batches", () => {
  assert.equal(mainProductionHistoryQuery(new URLSearchParams()).size, 25);
  const query = mainProductionHistoryQuery(new URLSearchParams({ page: "42", size: "25" }));
  assert.equal((query.page - 1) * query.size, 1025);
});
test("main mixing history uses Manila dates and escaped ingredient/output search", () => {
  const query = mainProductionHistoryQuery(new URLSearchParams({ from: "2026-11-01", to: "2026-11-08", search: "Chicken (OS1)", status: "POSTED" }));
  assert.equal(query.filter.productionDate?.$gte?.toISOString(), "2026-10-31T16:00:00.000Z");
  assert.equal(query.filter.productionDate?.$lt?.toISOString(), "2026-11-08T16:00:00.000Z");
  assert.equal(query.filter.status, "POSTED");
  assert.equal(query.filter.$or?.[2]["ingredients.productName"]?.test("Chicken (OS1)"), true);
});
test("invalid history dates and statuses are rejected", () => {
  for (const params of [{ from: "2026-02-30" }, { from: "2026-11-08", to: "2026-11-01" }, { status: "DELETED" }]) assert.throws(() => mainProductionHistoryQuery(new URLSearchParams(params)));
});
