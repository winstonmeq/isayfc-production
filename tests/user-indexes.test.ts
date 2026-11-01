import assert from "node:assert/strict";
import test from "node:test";
import User from "../models/User";

test("username has exactly one unique schema index", () => {
  const indexes = User.schema.indexes().filter(([fields]: [Record<string, unknown>, unknown]) => Object.keys(fields).length === 1 && fields.username === 1);
  assert.equal(indexes.length, 1);
  assert.equal(indexes[0][1].unique, true);
});
