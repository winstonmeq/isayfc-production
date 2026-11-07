import test from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import Sale from "../models/Sale";
import SaleLine from "../models/SaleLine";
import Expense from "../models/Expense";
import { getOwnerOutletAllocations } from "../lib/owner-outlet-allocations";

test("overall delivery reference uses historical main COGS, never an automatic expense", async t => {
  const id = new Types.ObjectId();
  t.mock.method(Sale, "find", () => ({ populate: () => ({ sort: () => ({ lean: async () => [{ _id: id, totalAmount: 395, balance: 0, recognizedAt: new Date(), customerId: { name: "Outlet A" } }] }) }) }));
  t.mock.method(SaleLine, "find", () => ({ lean: async () => [{ saleId: id, productName: "C10", stockUnit: "PACK", qty: 1, baseQty: 50, lineTotal: 395, unitCost: 5 }] }));
  t.mock.method(Expense, "find", () => { throw new Error("Internal delivery costs must not be read from expenses"); });
  const result = await getOwnerOutletAllocations(new Date("2026-11-01"), new Date("2026-12-01"));
  assert.equal(result.transferValue, 395);
  assert.equal(result.actualCost, 250);
  assert.equal(result.outstandingBalance, 0);
  assert.equal(result.missingCostLines, 0);
});
