import assert from "node:assert/strict";
import test from "node:test";
import { isInternalOutletTransaction, internalOutletMatchClauses, internalReceiptSettlement } from "../lib/internal-outlet";
import { weightedCompanyCost, productionCompanyCost, allocateCompanyOutputs } from "../lib/company-cost";
import { initialSaleFulfillment } from "../lib/sale-fulfillment";
import { isRevenueRecognized } from "../lib/sale-fulfillment";

test("outlet delivery stays debt-free at entry and receipt", () => {
  assert.equal(initialSaleFulfillment(true, 120, new Date()).balance, 0);
  assert.equal(isRevenueRecognized("RECOGNIZED", "INTERNAL_TRANSFER"), false);
  assert.deepEqual(internalReceiptSettlement(), { transactionType: "INTERNAL_TRANSFER", fulfillmentStatus: "RECOGNIZED", status: "INTERNAL", paidAmount: 0, balance: 0 });
});
test("only explicit historical internal records are excluded; ordinary outlet customer sales remain sales", () => {
  assert.equal(isInternalOutletTransaction({ transactionType: "INTERNAL_TRANSFER" }), true);
  assert.equal(isInternalOutletTransaction({ stockTransferId: "legacy", source: "CHICKEN" }), false);
  assert.equal(isInternalOutletTransaction({ stockTransferId: "legacy", source: "OUTLET" }), false);
  assert.equal(isInternalOutletTransaction({ source: "CHICKEN" }), false);
  assert.equal(internalOutletMatchClauses().length, 1);
});
test("purchase through internal delivery, mixing and final sale excludes markup from company profit", () => {
  // Main spends 100, internally values the batch at 120; outlet sells ten units for 180.
  const original = weightedCompanyCost(0, undefined, 10, 10);
  const finishedOriginal = productionCompanyCost([{ quantity: 10, companyUnitCost: original }], 10);
  const outletCogs = 120;
  const companyCogs = 10 * Number(finishedOriginal);
  assert.equal(180 - outletCogs, 60);
  assert.equal(companyCogs, 100);
  assert.equal(180 - companyCogs, 80);
});
test("original costs weight stock and preserve unknown legacy costs", () => {
  assert.equal(weightedCompanyCost(10, 5, 10, 7), 6);
  assert.equal(weightedCompanyCost(10, undefined, 10, 7), undefined);
  assert.equal(productionCompanyCost([{ quantity: 2 }], 10), undefined);
});
test("multiple mobile outputs allocate the complete original batch cost", () => {
  const costs = allocateCompanyOutputs([{ quantity: 10, companyUnitCost: 10 }], [{ quantity: 5, weightPerUnit: 4 }, { quantity: 10, weightPerUnit: 8 }]);
  assert.equal(Number(costs[0]) * 5 + Number(costs[1]) * 10, 100);
});
