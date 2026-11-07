import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeRolePermissions, canSelectPosOutlets } from "../lib/role-permissions";

test("outlet sales no longer grants unrelated mutation permissions", () => {
  const sales = normalizeRolePermissions(["pos.manage"]);
  for (const key of ["pos.menu.manage", "pos.expenses.manage", "stock-transfers.confirm", "outlet-repack.manage", "customer-returns.approve"]) assert.ok(!sales.includes(key as typeof sales[number]));
  for (const key of ["pos.menu.manage", "pos.expenses.manage", "outlet-repack.manage", "stock-transfers.confirm"]) assert.ok(normalizeRolePermissions([key]).includes("pos.view"));
});
test("each outlet mutation checks its own permission", () => {
  for (const [path, permission] of [
    ["mixing/route.ts", "outlet-repack.manage"], ["transfers/[id]/confirm/route.ts", "stock-transfers.confirm"],
    ["menu/route.ts", "pos.menu.manage"], ["expenses/route.ts", "pos.expenses.manage"],
    ["expenses/[id]/route.ts", "pos.expenses.manage"], ["stock-usage/route.ts", "pos.expenses.manage"],
    ["deductions/route.ts", "pos.deductions.manage"],
  ]) assert.ok(readFileSync(`app/api/pos/${path}`, "utf8").includes(`requirePermission("${permission}")`));
});
test("comparison report alone does not grant cross-outlet operation", () => {
  assert.equal(canSelectPosOutlets({ role: "USER", roleName: "Supervisor", permissions: ["pos.manage", "reports.outlet-comparison"] }), false);
});
test("return approval is separate from stock posting", () => {
  assert.ok(readFileSync("app/api/customer-returns/[id]/review/route.ts", "utf8").includes('requirePermission("customer-returns.approve")'));
  const post = readFileSync("app/api/customer-returns/[id]/post/route.ts", "utf8");
  assert.ok(post.includes('requirePermission("inventory-adjustments.manage")'));
  assert.ok(post.includes('requirePermission("payments.manage")'));
});
test("payment receipts require finance access and cannot be cached publicly", () => {
  const route = readFileSync("app/api/uploads/[category]/[filename]/route.ts", "utf8");
  assert.ok(route.includes('if (category === "payments")'));
  assert.ok(route.includes('requirePermission(["payments.view", "payments.manage", "reports.payments"])'));
  assert.ok(route.includes('"private, no-store"'));
});
