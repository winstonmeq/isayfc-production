import test from "node:test";
import assert from "node:assert/strict";
import { canonicalReportPath } from "../lib/report-navigation";
import { appNavItems } from "../components/app-shell/nav-config";
test("main reports expose five distinct purposes without duplicate outlet reports", () => {
  const reports = appNavItems.find(item => item.title === "Reports")?.children || [];
  assert.deepEqual(reports.map(item => item.href), ["/reports/gross-sales", "/reports/sales", "/reports/inventory", "/reports/payments", "/reports/overall"]);
});
test("legacy report workspace links resolve without deleting transaction data", () => {
  assert.equal(canonicalReportPath("/reports/profit"), "/reports/gross-sales");
  assert.equal(canonicalReportPath("/reports/outlet-pos"), "/pos");
  assert.equal(canonicalReportPath("/outlet-summary"), "/pos");
  assert.equal(canonicalReportPath("/reports/overall"), "/reports/overall");
});
