import test from "node:test";
import assert from "node:assert/strict";
import Product from "../models/Product";
import BodegaProduct from "../models/BodegaProduct";
import Category from "../models/Category";
import { Types } from "mongoose";
import { PRODUCT_USAGE_OPTIONS, isProductUsage, productUsage, productUsageLabel } from "../lib/product-usage";

test("product usage supports the requested cost classifications without guessing old products", () => {
  for (const option of PRODUCT_USAGE_OPTIONS) {
    assert.equal(isProductUsage(option.value), true);
    assert.equal(productUsageLabel(option.value), option.label);
  }
  assert.equal(isProductUsage("RETAIL_RESALE"), true);
  assert.equal(productUsageLabel("RETAIL_RESALE"), "Retail / Resale Merchandise");
  assert.equal(isProductUsage("CONSUMABLE"), false);
  assert.equal(isProductUsage("INVALID"), false);
  assert.equal(productUsage(undefined), "UNASSIGNED");
  assert.equal(productUsageLabel(undefined), "Not Set");
  assert.equal(Category.schema.path("usage"), undefined);
});

test("both product models persist and validate usage without changing stock or prices", async () => {
  for (const usage of PRODUCT_USAGE_OPTIONS.map(option => option.value)) {
    const grocery = new Product({ name: "Flour", categoryId: new Types.ObjectId(), usage, stockPcs: 10, buyingPrice: 100, unitPrice: 120 });
    const bodega = new BodegaProduct({ name: "Chicken", usage, stockQty: 5, buyingPrice: 150, sellingPrice: 168 });
    await grocery.validate();
    await bodega.validate();
    assert.equal(grocery.toObject().usage, usage);
    assert.equal(bodega.toObject().usage, usage);
    assert.equal(grocery.stockPcs, 10);
    assert.equal(grocery.unitPrice, 120);
    assert.equal(bodega.stockQty, 5);
    assert.equal(bodega.sellingPrice, 168);
  }
  assert.equal(new Product({ name: "Old" }).usage, "UNASSIGNED");
  assert.equal(new BodegaProduct({ name: "Old" }).usage, "UNASSIGNED");
  await assert.rejects(new Product({ name: "Bad", categoryId: new Types.ObjectId(), usage: "INVALID" }).validate());
  await assert.rejects(new BodegaProduct({ name: "Bad", usage: "INVALID" }).validate());
});
