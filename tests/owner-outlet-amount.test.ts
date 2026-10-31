import assert from "node:assert/strict";
import test from "node:test";
import { ownerOutletAmount } from "../lib/owner-outlet-amount";

test("owner outlet column mirrors outstanding without changing sales, paid or balance", () => {
  const row = { sales: 840, paid: 0, balance: 840 };
  assert.equal(ownerOutletAmount("outlet-id", row.balance), 840);
  assert.deepEqual(row, { sales: 840, paid: 0, balance: 840 });
  assert.equal(ownerOutletAmount("outlet-id", 300), 300);
  assert.equal(ownerOutletAmount("outlet-id", 0), 0);
});
test("ordinary customers never contribute to owner outlet totals", () => {
  for (const link of [undefined, null, "", "NONE"]) assert.equal(ownerOutletAmount(link, 840), 0);
  assert.equal(ownerOutletAmount("outlet-id", NaN), 0);
});
