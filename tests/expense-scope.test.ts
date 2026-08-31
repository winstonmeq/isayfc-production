import assert from "node:assert/strict";
import test from "node:test";

import { isMainExpenseCategory } from "../lib/expense-scope";

test("business expenses accept only main-branch categories", () => {
  assert.equal(isMainExpenseCategory("GROCERY"), true);
  assert.equal(isMainExpenseCategory("BODEGA"), true);
  assert.equal(isMainExpenseCategory("OUTLET"), false);
});
