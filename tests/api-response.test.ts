import test from "node:test";
import assert from "node:assert/strict";
import { readApiResponse } from "../lib/api-response";

test("HTML failures give an actionable message instead of unexpected token JSON errors", async () => {
  await assert.rejects(readApiResponse(new Response("<!DOCTYPE html><html>Error</html>", {
    status: 500, headers: { "Content-Type": "text/html" },
  })), /HTTP 500/);
  await assert.rejects(readApiResponse(new Response("Unauthorized", { status: 401 })), /Sign in again/);
});
test("JSON API responses retain their business error or success message", async () => {
  const value = { success: false, message: "Insufficient stock" };
  assert.deepEqual(await readApiResponse(Response.json(value, { status: 400 })), value);
  await assert.rejects(readApiResponse(new Response("{", { headers: { "Content-Type": "application/json" } })), /unreadable response/);
});
