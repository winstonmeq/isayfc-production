import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { productionEnvironmentIssues } from "../lib/production-environment";

const valid = {
  MONGODB_URI: "mongodb://db/business",
  NEXTAUTH_SECRET: "a".repeat(48),
  NEXTAUTH_URL: "https://business.invalid",
  UPLOADS_DIR: path.resolve("../persistent-uploads"),
};
test("production settings accept complete configuration", () => {
  assert.deepEqual(productionEnvironmentIssues(valid), []);
});
test("production settings reject missing secrets, HTTP and test mode", () => {
  assert.ok(productionEnvironmentIssues({}).length >= 4);
  assert.ok(productionEnvironmentIssues({ ...valid, NEXTAUTH_SECRET: "replace-this-with-a-long-random-secret" }).length);
  assert.ok(productionEnvironmentIssues({ ...valid, NEXTAUTH_URL: "http://localhost:3000" }).length);
  assert.ok(productionEnvironmentIssues({ ...valid, BUSINESS_TEST_MODE: "1" }).length);
  assert.ok(productionEnvironmentIssues({ ...valid, SEED_ADMIN_RESET_PASSWORD: "true" }).length);
});
