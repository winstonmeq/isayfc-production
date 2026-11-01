import test from "node:test";
import assert from "node:assert/strict";
import { roleNameConflictMessage, isRoleDuplicateKey } from "../lib/role-name-conflict";
import Role from "../models/Role";

test("active and disabled name collisions have clear responses", () => {
  assert.match(roleNameConflictMessage(), /Edit the existing role/);
  assert.match(roleNameConflictMessage(true), /disabled role/);
  assert.equal(isRoleDuplicateKey({ code: 11000 }), true);
  assert.equal(isRoleDuplicateKey(new Error("unrelated")), false);
  assert.equal(isRoleDuplicateKey(null), false);
});
test("role name has exactly one unique index", () => {
  const indexes = Role.schema.indexes().filter(([keys]: [Record<string, unknown>, unknown]) => keys.name === 1);
  assert.equal(indexes.length, 1);
  assert.equal(indexes[0][1].unique, true);
});
