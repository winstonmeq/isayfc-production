import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loginActivityStatus } from "../lib/login-history-policy";
import { normalizeRolePermissions } from "../lib/role-permissions";
import { requiredPagePermission } from "../lib/page-access";

test("activity is recent interaction, not a promise of online status", () => {
  const now = new Date("2026-11-08T04:00:00Z");
  assert.equal(loginActivityStatus({ status: "FAILED" }, now), "Failed");
  assert.equal(loginActivityStatus({ status: "SUCCESS", lastActivityAt: "2026-11-08T03:59:00Z" }, now), "Recently active");
  assert.equal(loginActivityStatus({ status: "SUCCESS", lastActivityAt: "2026-11-08T03:55:00Z" }, now), "Inactive / unknown");
  assert.equal(loginActivityStatus({ status: "SUCCESS", lastActivityAt: "2026-11-08T04:01:00Z" }, now), "Inactive / unknown");
  assert.equal(loginActivityStatus({ status: "SUCCESS", logoutAt: now }, now), "Logged out");
  assert.equal(loginActivityStatus({ status: "SUCCESS", expiresAt: now }, now), "Expired");
});
test("history is administrator-only, not assignable to ordinary roles", () => {
  assert.equal(requiredPagePermission("/login-history"), "admin.login-history");
  assert.deepEqual(normalizeRolePermissions(["admin.login-history"]), []);
  assert.ok(readFileSync("app/api/login-history/route.ts", "utf8").includes('requirePermission("admin.login-history")'));
});
test("heartbeat cannot select another user's session and does not run an idle timer", () => {
  const api = readFileSync("app/api/session-activity/route.ts", "utf8");
  assert.ok(api.includes("session?.user?.loginHistoryId"));
  assert.ok(api.includes('req.headers.get("sec-fetch-site") !== "same-origin"'));
  assert.ok(!api.includes("req.json()"));
  const client = readFileSync("components/users/SessionActivity.tsx", "utf8");
  assert.ok(!client.includes("setInterval"));
  assert.ok(client.includes('document.visibilityState !== "visible"'));
});
