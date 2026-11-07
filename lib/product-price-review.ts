import { randomUUID } from "node:crypto";

export function needsPriceReview(previousCost: number, newCost: number, sellingPrice: number, purchaseCost?: number, previousPurchaseCost?: number) {
  return sellingPrice <= 0 || Math.abs(newCost - previousCost) >= 0.00005 ||
    (purchaseCost !== undefined && Math.abs(purchaseCost - (previousPurchaseCost ?? previousCost)) >= 0.00005);
}

type ReviewProduct = {
  buyingPrice: number; unitPrice: number; lastPurchaseCost?: number;
  priceReviewRequired?: boolean; priceReviewToken?: string; priceReviewPreviousCost?: number;
  priceReviewRequestedAt?: Date;
};
export function flagProductPriceReview(product: ReviewProduct, previousCost: number, purchaseCost?: number) {
  if (needsPriceReview(previousCost, product.buyingPrice, product.unitPrice, purchaseCost, product.lastPurchaseCost)) {
    product.priceReviewRequired = true;
    product.priceReviewToken = randomUUID();
    product.priceReviewPreviousCost = previousCost;
    product.priceReviewRequestedAt = new Date();
  }
  if (purchaseCost !== undefined) product.lastPurchaseCost = purchaseCost;
}

export function validSellingPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1e9 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}
