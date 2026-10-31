import { strict as assert } from "node:assert";
import { test } from "node:test";
import { belongsToInventoryScope, inventoryReportScope, isOutletRoute } from "../lib/outlet-navigation";
import { appNavItems } from "../components/app-shell/nav-config";

test("outlet modules belong to one operations group, not main finance reports", () => {
  const outlet = appNavItems.find((item) => item.title === "Outlet Operations")!;
  assert.equal(outlet.section, "Operations");
  for (const route of ["/pos", "/reports/outlet-pos", "/outlet-inventory", "/outlet-summary", "/payments/pos-collections"]) {
    assert.ok(outlet.children?.some((child) => child.href === route));
    assert.ok(!appNavItems.filter((item) => item.section === "Finance").some((item) => item.href === route || item.children?.some((child) => child.href === route)));
    assert.equal(isOutletRoute(route), true);
    assert.equal(isOutletRoute("/finance", route), true);
  }
  assert.equal(isOutletRoute("/sales/history"), false);
  assert.equal(isOutletRoute("/pos-other"), false);
});

test("stock report scope defaults to main and never mixes outlet balances", () => {
  assert.equal(inventoryReportScope(null), "MAIN");
  assert.equal(inventoryReportScope("ALL"), "MAIN");
  assert.equal(inventoryReportScope("OUTLET"), "OUTLET");
  const sources = ["BODEGA", "GROCERY", "OUTLET"];
  assert.deepEqual(sources.filter((source) => belongsToInventoryScope(source, "MAIN")), ["BODEGA", "GROCERY"]);
  assert.deepEqual(sources.filter((source) => belongsToInventoryScope(source, "OUTLET")), ["OUTLET"]);
});
