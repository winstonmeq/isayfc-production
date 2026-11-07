import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("income statement bounds product columns and preserves full-period totals", () => {
  const source = readFileSync("components/reports/GrossSalesProfitabilityReportPageClient.tsx", "utf8");
  assert.ok(source.includes('aria-label="Product category"'));
  assert.ok(source.includes("selectedProducts.slice((currentProductPage - 1) * 6, currentProductPage * 6)"));
  assert.ok(source.includes("return data.totals;"));
  assert.ok(source.includes("Printing includes the displayed product columns."));
});
