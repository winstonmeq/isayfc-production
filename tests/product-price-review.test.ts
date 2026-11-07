import test from "node:test";
import assert from "node:assert/strict";
import { flagProductPriceReview, needsPriceReview, validSellingPrice } from "../lib/product-price-review";

test("cost changes require review; unchanged costs do not", () => {
  assert.equal(needsPriceReview(10, 12, 15), true);
  assert.equal(needsPriceReview(10, 9, 15), true);
  assert.equal(needsPriceReview(10, 10, 15, 12, 10), true);
  assert.equal(needsPriceReview(10, 10, 15, 10, 10), false);
  assert.equal(needsPriceReview(10, 10, 0), true);
});
test("purchase flag keeps selling price and original cost snapshot; repeat changes refresh token", () => {
  const product = { buyingPrice: 12, unitPrice: 15, priceReviewToken: "old", priceReviewRequired: false, priceReviewPreviousCost: 0 };
  flagProductPriceReview(product, 10, 13);
  assert.equal(product.unitPrice, 15);
  assert.equal(product.priceReviewRequired, true);
  assert.equal(product.priceReviewPreviousCost, 10);
  assert.notEqual(product.priceReviewToken, "old");
  const token = product.priceReviewToken;
  product.buyingPrice = 14;
  flagProductPriceReview(product, 12, 14);
  assert.notEqual(product.priceReviewToken, token);
});
test("invalid approval prices rejected", () => {
  for (const value of [0, -1, NaN, Infinity, "12", 12.345]) assert.equal(validSellingPrice(value), false);
  assert.equal(validSellingPrice(12.5), true);
});
