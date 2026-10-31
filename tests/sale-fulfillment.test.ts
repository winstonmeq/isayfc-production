import assert from "node:assert/strict";
import test from "node:test";

import {
  initialSaleFulfillment,
  isRevenueRecognized,
} from "../lib/sale-fulfillment";

test("outlet-linked main sale stays pending until transfer receipt", () => {
  const state = initialSaleFulfillment(true, 168, new Date("2026-08-31"));
  assert.deepEqual(state, {
    balance: 0,
    status: "PENDING",
    fulfillmentStatus: "PENDING",
  });
  assert.equal(isRevenueRecognized(state.fulfillmentStatus), false);
});

test("direct external sale is recognized immediately", () => {
  const saleDate = new Date("2026-08-31");
  const state = initialSaleFulfillment(false, 168, saleDate);
  assert.equal(state.balance, 168);
  assert.equal(state.status, "UNPAID");
  assert.equal(state.fulfillmentStatus, "DIRECT");
  assert.equal(state.recognizedAt, saleDate);
  assert.equal(isRevenueRecognized(state.fulfillmentStatus), true);
  assert.equal(isRevenueRecognized(undefined), true); // legacy recognized rows
});

test("a fully discounted direct sale has no outstanding payment", () => {
  const state = initialSaleFulfillment(false, 0, new Date("2026-10-31"));
  assert.equal(state.balance, 0);
  assert.equal(state.status, "PAID");
});
