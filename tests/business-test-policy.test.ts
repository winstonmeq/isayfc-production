import test from "node:test";
import assert from "node:assert/strict";
import { assertBusinessTestDatabase } from "../lib/business-test-policy";

test("business testing only permits the dedicated database", () => {
  assert.equal(assertBusinessTestDatabase("letson_business_test", "live"), "letson_business_test");
  for (const name of [undefined, "letsonDB", "admin", ""]) {
    assert.throws(() => assertBusinessTestDatabase(name));
  }
  assert.throws(() => assertBusinessTestDatabase("letson_business_test", "letson_business_test"));
});
