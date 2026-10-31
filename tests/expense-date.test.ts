import assert from "node:assert/strict";
import test from "node:test";
import { parseExpenseDate } from "../lib/expense-date";

test("expense dates reject impossible dates and malformed input before posting", () => {
  for (const value of ["2026-02-30", "2026-02-29", "2026-13-01", "2026-01-32", "2026-1-01", "2026-10-31T12:00:00Z", "garbage", ""]) {
    assert.equal(parseExpenseDate(value), null, value);
  }
  assert.equal(parseExpenseDate("2024-02-29")?.toISOString(), "2024-02-29T00:00:00.000Z");
  assert.equal(parseExpenseDate("2026-10-31")?.toISOString(), "2026-10-31T00:00:00.000Z");
});
