import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_SOURCE_OPTIONS, categoryMatchesSource, categorySource, categorySourceLabel, isCategorySource, categorySourceScope } from "../lib/category-source";
import Category, { categorySchemaNeedsRefresh } from "../models/Category";
import { Schema } from "mongoose";

test("category source is explicit and unassigned legacy categories are identified", async () => {
  for (const option of CATEGORY_SOURCE_OPTIONS) assert.equal(isCategorySource(option.value), true);
  assert.equal(isCategorySource("Plastic"), false);
  assert.equal(categorySource(undefined), "SHARED");
  assert.equal(categorySourceLabel(undefined), "Unassigned — set Source");
  assert.equal(new Category({ name: "Gloves" }).source, "SHARED");
  await assert.rejects(new Category({ name: "Gloves", source: "UNKNOWN" }).validate());
});

test("category selection stays within product source without blocking Shared categories", () => {
  for (const source of ["GROCERY", "BODEGA", "OUTLET"] as const) {
    assert.equal(categoryMatchesSource(source, source), true);
    assert.equal(categoryMatchesSource("SHARED", source), true);
    assert.equal(categoryMatchesSource(undefined, source), false);
  }
  assert.equal(categoryMatchesSource("BODEGA", "GROCERY"), false);
  assert.equal(categoryMatchesSource("OUTLET", "GROCERY"), false);
  assert.equal(categoryMatchesSource("GROCERY", "BODEGA"), false);
});

test("source dropdown query excludes other sources and unassigned categories", () => {
  assert.deepEqual(categorySourceScope("GROCERY"), { source: { $in: ["GROCERY", "SHARED"] } });
  assert.deepEqual(categorySourceScope("BODEGA"), { source: { $in: ["BODEGA", "SHARED"] } });
  assert.deepEqual(categorySourceScope("OUTLET"), { source: { $in: ["OUTLET", "SHARED"] } });
});

test("stale category schemas are detected and the current schema retains Source without Usage", async () => {
  assert.equal(categorySchemaNeedsRefresh(new Schema({ name: String })), true);
  assert.equal(categorySchemaNeedsRefresh(new Schema({ name: String })), true);
  assert.equal(categorySchemaNeedsRefresh(Category.schema), false);
  const category = new Category({ name: "Plastic", source: "GROCERY" });
  await category.validate();
  assert.equal(category.toObject().source, "GROCERY");
  category.set({ source: "SHARED" });
  await category.validate();
  assert.equal(category.toObject().source, "SHARED");
  assert.equal(Category.schema.path("usage"), undefined);
});
