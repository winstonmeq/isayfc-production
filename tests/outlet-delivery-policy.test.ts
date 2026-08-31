import assert from "node:assert/strict";
import test from "node:test";

import { canCreateManualOutletDelivery } from "../lib/outlet-delivery-policy";

test("only administrators can create a manual outlet delivery", () => {
  assert.equal(canCreateManualOutletDelivery({ role: "ADMIN" }), true);
  assert.equal(canCreateManualOutletDelivery({ role: "USER", roleName: "ADMIN" }), true);
  assert.equal(canCreateManualOutletDelivery({ role: "USER", roleName: "Cashier" }), false);
  assert.equal(canCreateManualOutletDelivery({ role: "USER", roleName: "Manager" }), false);
});
