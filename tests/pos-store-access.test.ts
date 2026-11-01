import test from "node:test";
import assert from "node:assert/strict";
import { canSelectPosOutlets } from "../lib/role-permissions";

test("outlet sales managers can select stores only with operational permission", () => {
  assert.equal(canSelectPosOutlets({ role: "USER", roleName: "OUTLET SALES MANAGER", permissions: ["pos.view", "pos.all-outlets"] }), true);
  assert.equal(canSelectPosOutlets({ role: "USER", roleName: "Outlet Sales Manager", permissions: [] }), false);
});

test("custom manager roles use store-scope permissions rather than exact names", () => {
  for (const roleName of ["MANAGER SALES", "Sales Supervisor", "OUTLET MANAGER"]) {
    assert.equal(canSelectPosOutlets({ role: "USER", roleName, permissions: ["pos.view", "pos.all-outlets"] }), true);
    assert.equal(canSelectPosOutlets({ role: "USER", roleName, permissions: ["pos.manage", "reports.outlet-comparison"] }), true);
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
