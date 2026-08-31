import assert from "node:assert/strict";
import test from "node:test";

import { getMainSalesReportSource } from "../lib/report-scope";

test("main sales report accepts only main-branch product sources", () => {
  assert.equal(getMainSalesReportSource("CHICKEN"), "CHICKEN");
  assert.equal(getMainSalesReportSource("BODEGA"), "BODEGA");
  assert.equal(getMainSalesReportSource("OUTLET"), null);
  assert.equal(getMainSalesReportSource("ALL"), null);
});
