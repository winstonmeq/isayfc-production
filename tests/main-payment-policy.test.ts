import test from "node:test";
import assert from "node:assert/strict";
import { ownerOutletSettlement, mainPaymentStatus, INTERNAL_PAYMENT_LABEL, nonCollectibleSaleClauses } from "../lib/main-payment-policy";
import { initialSaleFulfillment, isRevenueRecognized } from "../lib/sale-fulfillment";

test("accepted owner outlet sale has no cash payment and no collectible balance", () => {
  assert.deepEqual(ownerOutletSettlement(), { status: "INTERNAL", paidAmount: 0, balance: 0 });
  assert.equal(mainPaymentStatus("INTERNAL"), INTERNAL_PAYMENT_LABEL);
  assert.equal(isRevenueRecognized("RECOGNIZED", "EXTERNAL_SALE"), true);
});
test("external customer payment states and pending delivery recognition remain unchanged", () => {
  const date = new Date("2026-11-06T00:00:00Z");
  assert.equal(initialSaleFulfillment(false, 500, date).balance, 500);
  assert.equal(initialSaleFulfillment(false, 500, date).status, "UNPAID");
  assert.equal(initialSaleFulfillment(true, 500, date).status, "PENDING");
  assert.equal(mainPaymentStatus("PARTIAL"), "PARTIAL");
  assert.equal(mainPaymentStatus("PAID"), "PAID");
  assert.deepEqual(nonCollectibleSaleClauses(), [{ transactionType: "INTERNAL_TRANSFER" }, { ownerOutletId: { $exists: true, $ne: null } }, { status: "INTERNAL" }]);
});
