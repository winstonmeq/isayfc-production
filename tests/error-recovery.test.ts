import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorRecovery } from "../components/errors/ErrorRecovery";
import { safeErrorPath, validErrorReference } from "../lib/system-error-policy";

test("error paths exclude query strings, fragments and arbitrary text", () => {
  assert.equal(safeErrorPath("/sales/all?token=secret#password"), "/sales/all");
  assert.equal(safeErrorPath("https://secret.example"), "/unknown");
  assert.equal(safeErrorPath("/bad path"), "/unknown");
  assert.equal(safeErrorPath(null), "/unknown");
  assert.equal(validErrorReference("error-12345678"), true);
  assert.equal(validErrorReference("short"), false);
  assert.equal(validErrorReference("token=secret"), false);
});
test("recovery UI warns about saved transactions and does not expose raw errors", () => {
  const html = renderToStaticMarkup(createElement(ErrorRecovery, { error: new Error("DATABASE_URI_SECRET"), reset: () => {} }));
  assert.ok(html.includes("check the transaction list"));
  for (const action of ["Try again", "Reload", "Sign in"]) assert.ok(html.includes(action));
  assert.ok(!html.includes("DATABASE_URI_SECRET"));
});
test("root fallback owns its document and uses no session provider", () => {
  const global = readFileSync("app/global-error.tsx", "utf8");
  assert.ok(global.includes('<html lang="en">'));
  assert.ok(global.includes("<body"));
  assert.ok(!global.includes("useSession"));
  assert.ok(readFileSync("components/errors/ErrorRecovery.tsx", "utf8").includes("if (unstable_retry) unstable_retry(); else reset();"));
});
test("new API handlers catch errors and reporting is authenticated and bounded", () => {
  for (const path of ["app/api/login-history/route.ts", "app/api/session-activity/route.ts"]) {
    const code = readFileSync(path, "utf8");
    assert.ok(code.includes("} catch {"));
    assert.ok(code.includes("status: 503"));
    assert.ok(code.includes("recordSystemError"));
  }
  const report = readFileSync("app/api/system-errors/route.ts", "utf8");
  assert.ok(report.includes("getServerSession(authOptions)"));
  assert.ok(report.includes("if (!access?.isActive)"));
  assert.ok(report.includes("size > 2048"));
  assert.ok(report.includes("limiter.check(userId)"));
  assert.ok(report.includes('req.headers.get("sec-fetch-site") !== "same-origin"'));
});
