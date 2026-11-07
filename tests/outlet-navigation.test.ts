import { strict as assert } from "node:assert";
import { test } from "node:test";
import { belongsToInventoryScope, inventoryReportScope, isOutletRoute, outletWorkspaceHref } from "../lib/outlet-navigation";
import { appNavItems } from "../components/app-shell/nav-config";

test("outlet operations opens the directory and supports outlet workspace routes", () => {
  const outlet = appNavItems.find((item) => item.title === "Outlet Operations")!;
  assert.equal(outlet.section, "Operations");
  assert.equal(outlet.href, "/pos");
  assert.equal(isOutletRoute("/pos"), true);
  assert.equal(outletWorkspaceHref("outlet-a"), "/pos/outlets/outlet-a");
  assert.equal(isOutletRoute(outletWorkspaceHref("outlet-a")), true);
  assert.equal(isOutletRoute("/sales/history"), false);
  assert.equal(isOutletRoute("/pos-other"), false);

  const reports = appNavItems.find((item) => item.title === "Reports")!;
  assert.ok(!reports.children?.some((child) => child.href === "/reports/outlet-pos"));
  assert.ok(!reports.children?.some((child) => child.href === "/outlet-summary"));
  assert.ok(reports.children?.some((child) => child.href === "/reports/overall"));

  assert.ok(!appNavItems.flatMap(item => item.children || []).some(child => child.href === "/payments/pos-collections"));

  const inventory = appNavItems.find((item) => item.title === "Inventory")!;
  assert.ok(!inventory.children?.some((child) => child.href === "/outlet-inventory"));
});

test("stock report scope defaults to main and never mixes outlet balances", () => {
  assert.equal(inventoryReportScope(null), "MAIN");
  assert.equal(inventoryReportScope("ALL"), "MAIN");
  assert.equal(inventoryReportScope("OUTLET"), "OUTLET");
  const sources = ["BODEGA", "GROCERY", "OUTLET"];
  assert.deepEqual(sources.filter((source) => belongsToInventoryScope(source, "MAIN")), ["BODEGA", "GROCERY"]);
  assert.deepEqual(sources.filter((source) => belongsToInventoryScope(source, "OUTLET")), ["OUTLET"]);
});
