import assert from "node:assert/strict";
import test from "node:test";
import { mainTransactionType, allocationLineCost } from "../lib/owner-outlet-policy";
import { initialSaleFulfillment, isRevenueRecognized } from "../lib/sale-fulfillment";
import { outletSaleRecognitionUpdate } from "../lib/outlet-sale-recognition";

test("owner outlet customer sale waits for receipt, then is recognized as revenue", () => {
  const type = mainTransactionType("outlet-a");
  assert.equal(type, "EXTERNAL_SALE");
  assert.equal(initialSaleFulfillment(true, 1700, new Date()).balance, 0);
  assert.equal(isRevenueRecognized("RECOGNIZED", type), true);
  const cost = allocationLineCost({ baseQty: 10, qty: 10, unitCost: 150 });
  assert.equal(cost, 1500);
  // Main-only management result: no external sales, actual cost allocated once.
  assert.equal(0 - Number(cost), -1500);
  const receipt = outletSaleRecognitionUpdate()[0].$set;
  assert.equal(receipt.balance.$cond[1], 0);
  assert.equal(receipt.status.$cond[1], "INTERNAL");
  assert.equal("paidAmount" in receipt, false);
});

test("external customers remain normal credit sales", () => {
  assert.equal(mainTransactionType(undefined), "EXTERNAL_SALE");
  assert.equal(mainTransactionType("NONE"), "EXTERNAL_SALE");
  assert.equal(initialSaleFulfillment(false, 1700, new Date()).balance, 1700);
  assert.equal(isRevenueRecognized("DIRECT", "EXTERNAL_SALE"), true);
});

test("allocation cost uses base quantities and flags absent historical costs", () => {
  assert.equal(allocationLineCost({ qty: 2, baseQty: 100, unitCost: 5 }), 500);
  assert.equal(allocationLineCost({ qty: 2 }), null);
  assert.equal(allocationLineCost({ baseQty: 10, unitCost: NaN }), null);
});
