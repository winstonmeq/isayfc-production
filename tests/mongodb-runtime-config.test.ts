import test from "node:test";
import assert from "node:assert/strict";
import dbConnect from "../lib/mongodb";

test("database module imports without a build-time secret; runtime connection still requires it", async () => {
  const previous = process.env.MONGODB_URI;
  try {
    delete process.env.MONGODB_URI;
    await assert.rejects(dbConnect(), /MONGODB_URI is not configured in the server runtime environment/);
  } finally {
    if (previous === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previous;
  }
});
