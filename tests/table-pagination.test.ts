import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TABLE_PAGE_SIZE, paginateTable } from "../lib/table-pagination";

const records = Array.from({ length: 63 }, (_, index) => ({ id: index + 1, amount: 10 }));
test("expense and inventory pagination defaults to 25 rows", () => {
  const first = paginateTable(records);
  assert.equal(DEFAULT_TABLE_PAGE_SIZE, 25);
  assert.equal(first.rows.length, 25);
  assert.equal(first.rows[0].id, 1);
  assert.equal(first.rows[24].id, 25);
  assert.equal(first.totalPages, 3);
  assert.equal(first.from, 1);
  assert.equal(first.to, 25);
  assert.equal(first.total, 63);
});
test("next and final pages preserve ordering and full filtered totals", () => {
  const second = paginateTable(records, 2);
  const last = paginateTable(records, 3);
  assert.equal(second.rows[0].id, 26);
  assert.equal(second.to, 50);
  assert.equal(last.rows.length, 13);
  assert.equal(last.from, 51);
  assert.equal(last.to, 63);
  assert.equal(records.reduce((sum, row) => sum + row.amount, 0), 630);
  assert.equal(last.total, 63);
});
test("pagination clamps after filtering/deletion and handles empty tables", () => {
  const empty = paginateTable([], 8);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.page, 1);
  assert.equal(empty.totalPages, 1);
  assert.equal(empty.from, 0);
  assert.equal(empty.to, 0);
  assert.equal(paginateTable(records.slice(0, 5), 3).page, 1);
  assert.equal(paginateTable(records, -1).page, 1);
  assert.equal(paginateTable(records, NaN).page, 1);
});
test("supported page sizes work and invalid sizes use 25", () => {
  assert.equal(paginateTable(records, 1, 50).rows.length, 50);
  assert.equal(paginateTable(records, 1, 10).totalPages, 7);
  assert.equal(paginateTable(records, 1, 100).rows.length, 63);
  assert.equal(paginateTable(records, 1, 0).pageSize, 25);
});
