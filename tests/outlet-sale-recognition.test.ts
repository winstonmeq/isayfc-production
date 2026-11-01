import test from "node:test";
import assert from "node:assert/strict";
import { outletSaleRecognitionUpdate } from "../lib/outlet-sale-recognition";
import { initialSaleFulfillment } from "../lib/sale-fulfillment";
import { isInternalOutletTransaction } from "../lib/internal-outlet";

test("ordinary outlet customer orders wait for receipt and are not internal allocations", () => {
  const initial = initialSaleFulfillment(true, 500, new Date());
  assert.equal(initial.balance, 0);
  assert.equal(initial.fulfillmentStatus, "PENDING");
  assert.equal(isInternalOutletTransaction({ transactionType: "EXTERNAL_SALE", stockTransferId: "delivery", source: "CHICKEN" }), false);
});
test("receipt pipeline recognizes the sale and calculates balance without changing payment amounts", () => {
  const date = new Date("2026-10-31T10:00:00Z");
  const [update] = outletSaleRecognitionUpdate(date);
  assert.equal(update.$set.fulfillmentStatus, "RECOGNIZED");
  assert.equal(update.$set.recognizedAt, date);
  assert.deepEqual(update.$set.balance, { $cond: [{ $eq: ["$transactionType", "INTERNAL_TRANSFER"] }, 0, { $max: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0] }] });
  assert.equal("paidAmount" in update.$set, false);
  assert.match(JSON.stringify(update.$set.status), /UNPAID/);
});
