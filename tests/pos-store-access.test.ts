import test from "node:test";
import assert from "node:assert/strict";
import { canSelectPosOutlets, canAccessPosOutlet } from "../lib/role-permissions";
import { readFileSync } from "node:fs";

test("outlet sales managers can select stores only with operational permission", () => {
  assert.equal(canSelectPosOutlets({ role: "USER", roleName: "OUTLET SALES MANAGER", permissions: ["pos.view", "pos.all-outlets"] }), true);
  assert.equal(canSelectPosOutlets({ role: "USER", roleName: "Outlet Sales Manager", permissions: [] }), false);
});

test("custom manager roles use store-scope permissions rather than exact names", () => {
  for (const roleName of ["MANAGER SALES", "Sales Supervisor", "OUTLET MANAGER"]) {
    assert.equal(canSelectPosOutlets({ role: "USER", roleName, permissions: ["pos.view", "pos.all-outlets"] }), true);
    assert.equal(canSelectPosOutlets({ role: "USER", roleName, permissions: ["pos.manage", "reports.outlet-comparison"] }), false);
    assert.equal(canSelectPosOutlets({ role: "USER", roleName, permissions: ["pos.view"] }), false);
  }
  assert.equal(canSelectPosOutlets({ role: "CASHIER", roleName: "Outlet Cashier", permissions: ["pos.manage", "pos.all-outlets"] }), false);
});
test("cashiers and ordinary users cannot select other stores", () => {
  for (const roleName of ["Outlet Cashier", "CASHIER", "Outlet User", "Report Viewer"]) {
    assert.equal(canSelectPosOutlets({ role: "USER", roleName, permissions: ["pos.view", "pos.manage"] }), false);
  }
  assert.equal(canSelectPosOutlets({ role: "ADMIN", roleName: "ADMIN", permissions: [] }), true);
});

test("system managers can operate selected outlets without a personal store assignment", () => {
  const manager = { role: "USER", roleName: "SYSTEM MANAGER", permissions: ["pos.view", "pos.manage", "pos.all-outlets"] };
  assert.equal(canAccessPosOutlet(manager, "", "outlet-a"), true);
  assert.equal(canAccessPosOutlet(manager, "outlet-a", "outlet-b"), true);
  assert.equal(canAccessPosOutlet({ ...manager, permissions: ["pos.manage", "pos.all-outlets"] }, "", "outlet-a"), true);
  assert.equal(canAccessPosOutlet({ ...manager, permissions: ["pos.manage"] }, "", "outlet-a"), false);
});

test("cashier outlet boundaries remain enforced even with supervisor flags", () => {
  const cashier = { role: "CASHIER", roleName: "OUTLET CASHIER", permissions: ["pos.manage", "pos.all-outlets", "reports.outlet-comparison"] };
  assert.equal(canAccessPosOutlet(cashier, "outlet-a", "outlet-a"), true);
  assert.equal(canAccessPosOutlet(cashier, "outlet-a", "outlet-b"), false);
  assert.equal(canAccessPosOutlet(cashier, "", "outlet-a"), false);
  assert.equal(canAccessPosOutlet(cashier, "", ""), false);
});

test("outlet sale saving uses the shared scope and still requires sales write permission", () => {
  const route = readFileSync("app/api/pos/sales/route.ts", "utf8");
  assert.match(route, /requirePermission\("pos.manage"\)/);
  assert.match(route, /findAuthorizedPosOutlet\(session!\.user.id, outletId\)/);
  assert.doesNotMatch(route, /isAdmin\s*\|\|\s*assigned/);
  const access = readFileSync("lib/pos-outlet-access.ts", "utf8");
  assert.match(access, /canAccessPosOutlet\(access, assignedOutletId, outletId\)/);
  assert.match(access, /if \(!access\?\.isActive\) return null/);
});
