import test from "node:test";
import assert from "node:assert/strict";
import { canSelectPosOutlets } from "../lib/role-permissions";

test("outlet sales managers can select stores only with operational permission", () => {
  assert.equal(canSelectPosOutlets({ role: "USER", roleName: "OUTLET SALES MANAGER", permissions: ["pos.view"] }), true);
  assert.equal(canSelectPosOutlets({ role: "USER", roleName: "Outlet Sales Manager", permissions: [] }), false);
});
test("cashiers and ordinary users cannot select other stores", () => {
  for (const roleName of ["Outlet Cashier", "CASHIER", "Outlet User", "Report Viewer"]) {
    assert.equal(canSelectPosOutlets({ role: "USER", roleName, permissions: ["pos.view", "pos.manage"] }), false);
  }
  assert.equal(canSelectPosOutlets({ role: "ADMIN", roleName: "ADMIN", permissions: [] }), true);
});
