import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_PERMISSION_KEYS, ROLE_PRESETS, normalizeRolePermissions, legacyRoleForSelection, roleNeedsOutlet } from "../lib/role-permissions";
import { requiredPagePermission, userLandingPage } from "../lib/page-access";
import { appNavItems } from "../components/app-shell/nav-config";
import { filterNavByPermissions, firstPermittedRoute } from "../lib/nav-permissions";

test("permission catalogue has unique keys and safe write-to-view dependencies", () => {
  assert.equal(new Set(ROLE_PERMISSION_KEYS).size, ROLE_PERMISSION_KEYS.length);
  const permissions = normalizeRolePermissions(["users.manage", "users.manage", "inventory-adjustments.manage", "not-a-permission"]);
  assert.ok(permissions.includes("users.view"));
  assert.ok(permissions.includes("inventory-adjustments.view"));
  assert.ok(!permissions.includes("reports.overall"));
  assert.ok(!permissions.includes("sales.manage"));
  assert.equal(permissions.length, 4);
});

test("retired page permissions are not assignable and old log access maps to audit logs", () => {
  const retired = ["stock-counts.view", "stock-counts.manage", "stock-adjustment.manage", "reports.customer-balance", "reports.product-movement", "settings.manage", "customer-inventory.view"];
  assert.deepEqual(normalizeRolePermissions(retired), []);
  assert.deepEqual(normalizeRolePermissions(["activity-logs.view"]), ["audit-logs.view"]);
  assert.equal(requiredPagePermission("/units"), "products.view");
  assert.equal(requiredPagePermission("/customer-deliveries"), "customer-deliveries.view");
});

test("main, outlet and combined reports have distinct access", () => {
  assert.equal(requiredPagePermission("/reports/overall"), "reports.overall");
  assert.equal(requiredPagePermission("/reports/profit"), "reports.profit");
  assert.equal(requiredPagePermission("/reports/outlet-pos"), "reports.outlet-sales");
  assert.equal(requiredPagePermission("/outlet-summary"), "reports.outlet-comparison");
  assert.equal(requiredPagePermission("/payments/pos-collections"), "payments.outlet-collections");
  assert.equal(requiredPagePermission("/payments/history"), "payments.view");
});

test("new pages and query-selected modules use the same page guard", () => {
  for (const [path, permission] of [
    ["/accounts-payable", "accounts-payable.view"], ["/supplier-invoices", "supplier-invoices.view"],
    ["/supplier-payment-history", "accounts-payable.view"], ["/inventory-adjustments", "inventory-adjustments.view"],
    ["/slicing/reconciliation", "slicing.view"], ["/corrections", "corrections.view"], ["/roles", "roles.view"],
    ["/reports/overall", "reports.overall"],
  ]) {
    assert.equal(requiredPagePermission(path), permission);
    assert.equal(requiredPagePermission("/finance", path), permission);
  }
  assert.equal(requiredPagePermission("/supplier-invoices-fake"), null);
});

test("outlet cashier preset cannot enter main sales, payment or combined reports", () => {
  const permissions = normalizeRolePermissions(ROLE_PRESETS[0].permissions);
  assert.ok(permissions.includes("pos.manage"));
  assert.ok(permissions.includes("stock-transfers.confirm"));
  for (const permission of ["sales.manage", "sales.view", "payments.view", "expenses-bodega.manage", "reports.profit", "reports.overall", "users.manage"]) {
    assert.ok(!permissions.includes(permission as typeof permissions[number]));
  }
  const visible = filterNavByPermissions(appNavItems, permissions);
  assert.ok(visible.some((item) => item.title === "Outlet Operations"));
  assert.ok(!visible.some((item) => item.title === "Sales" || item.title === "Reports" || item.title === "Payments"));
  assert.equal(firstPermittedRoute(appNavItems, permissions, ["/pos", "/outlet-inventory"]), "/pos");
});

test("partial-access users land on permitted pages rather than hardcoded main defaults", () => {
  assert.equal(firstPermittedRoute(appNavItems, ["supplier-invoices.view"], ["/purchase-items", "/deliveries", "/supplier-invoices"]), "/supplier-invoices");
  assert.equal(firstPermittedRoute(appNavItems, ["accounts-payable.view"], ["/payments", "/accounts-payable"]), "/accounts-payable");
  assert.equal(firstPermittedRoute(appNavItems, ["inventory-adjustments.view"], ["/inventory/bodega", "/inventory/products", "/inventory-adjustments"]), "/inventory-adjustments");
  assert.equal(firstPermittedRoute(appNavItems, ["reports.overall"], ["/reports"]), "/reports/overall");
});

test("selected role controls legacy privileges and outlet assignment requirements", () => {
  assert.equal(legacyRoleForSelection("CASHIER"), "CASHIER");
  assert.equal(legacyRoleForSelection("Outlet Cashier"), "USER");
  assert.equal(legacyRoleForSelection("ADMIN"), "ADMIN");
  assert.equal(roleNeedsOutlet("Outlet Cashier", [...ROLE_PRESETS[0].permissions]), true);
  assert.equal(roleNeedsOutlet("ADMIN", ["pos.manage"]), false);
  assert.equal(roleNeedsOutlet("Outlet Sales Manager", ["pos.view", "pos.manage", "pos.employee-finance.manage"]), false);
  assert.equal(roleNeedsOutlet("Outlet User", ["pos.view", "pos.manage"]), false);
  assert.equal(roleNeedsOutlet("CASHIER", ["pos.view"]), true);
  assert.equal(roleNeedsOutlet("Owner Report Viewer", ["reports.overall"]), false);
});

test("all visible navigation links match guarded page permissions", () => {
  for (const item of appNavItems) {
    const leaves = item.children?.length ? item.children : item.href ? [item] : [];
    for (const leaf of leaves) if (leaf.href && leaf.permission) assert.equal(requiredPagePermission(leaf.href), leaf.permission, leaf.href);
  }
});

test("cashiers and report-only users land on accessible pages after login", () => {
  assert.equal(userLandingPage(ROLE_PRESETS[0].permissions), "/pos");
  assert.equal(userLandingPage(["reports.overall"]), "/reports/overall");
  assert.equal(userLandingPage(["accounts-payable.view"]), "/accounts-payable");
  assert.equal(userLandingPage(["pos.view"], false, "/finance?module=/reports/overall"), "/pos");
  assert.equal(userLandingPage(["pos.view"], false, "//evil.example"), "/pos");
  assert.equal(userLandingPage(["pos.view"], false, "/pos"), "/pos");
  assert.equal(userLandingPage([]), "/unauthorized");
});
