import test from "node:test";
import assert from "node:assert/strict";
import { deliveryDecisionSummary } from "../lib/delivery-item-decisions";
test("one acceptance does not finalize other pending products", () => {
  assert.deepEqual(deliveryDecisionSummary([{ itemStatus: "ACCEPTED", receivedPcs: 50 }, { itemStatus: "PENDING" }]), { complete: false, hasDiscrepancy: false, received: 50, variance: 0 });
});
test("rejection remains a discrepancy and adds no received stock", () => {
  assert.deepEqual(deliveryDecisionSummary([{ itemStatus: "ACCEPTED", receivedPcs: 50 }, { itemStatus: "REJECTED", receivedPcs: 0, varianceQty: 2 }]), { complete: true, hasDiscrepancy: true, received: 50, variance: 2 });
});
test("only fully accepted deliveries can post without discrepancy review", () => {
  const result = deliveryDecisionSummary([{ itemStatus: "ACCEPTED", receivedPcs: 1 }, { itemStatus: "ACCEPTED", receivedPcs: 2 }]);
  assert.equal(result.complete && !result.hasDiscrepancy, true);
  assert.equal(result.received, 3);
  assert.equal(deliveryDecisionSummary([]).complete, false);
});
