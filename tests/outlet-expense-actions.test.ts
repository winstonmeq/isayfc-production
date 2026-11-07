import test from "node:test";
import assert from "node:assert/strict";
import { outletExpenseActions, restoreConsumedStock } from "../lib/outlet-expense-actions";

test("manual expenses can be edited/voided, stock usage reversed only, batch expenses protected", () => {
  assert.deepEqual(outletExpenseActions("MANUAL"), { canEdit: true, canVoid: true });
  assert.deepEqual(outletExpenseActions(undefined), { canEdit: true, canVoid: true });
  assert.deepEqual(outletExpenseActions("STOCK_USAGE"), { canEdit: false, canVoid: true });
  assert.deepEqual(outletExpenseActions("PRODUCTION_USAGE"), { canEdit: false, canVoid: false });
  assert.deepEqual(outletExpenseActions("OWNER_OUTLET_DELIVERY"), { canEdit: false, canVoid: false });
});

test("void restores original quantity and weighted value after later receipts", () => {
  const restored = restoreConsumedStock({ stockQty: 80, buyingPrice: 300, packSize: 100, companyUnitCost: 2 }, { quantity: 20, unitCost: 2, companyAmount: 30 });
  assert.equal(restored.newStock, 100);
  assert.equal(restored.buyingPrice, 280);
  assert.equal(restored.companyUnitCost, 1.9);
  const empty = restoreConsumedStock({ stockQty: 0, buyingPrice: 0, packSize: 0 }, { quantity: 20, unitCost: 2, companyAmount: 30 });
  assert.deepEqual(empty, { newStock: 20, buyingPrice: 2, companyUnitCost: 1.5 });
});

test("void refuses broken consumption snapshots or unsafe stock balances", () => {
  const stock = { stockQty: 50, buyingPrice: 2, packSize: 0, companyUnitCost: 1.5 };
  for (const quantity of [undefined, NaN, 0, -1, Infinity]) assert.throws(() => restoreConsumedStock(stock, { quantity, unitCost: 2, companyAmount: 30 }));
  assert.throws(() => restoreConsumedStock({ ...stock, stockQty: -1 }, { quantity: 20, unitCost: 2, companyAmount: 30 }));
  assert.throws(() => restoreConsumedStock({ ...stock, companyUnitCost: undefined }, { quantity: 20, unitCost: 2, companyAmount: 30 }));
  assert.throws(() => restoreConsumedStock(stock, { quantity: 20, unitCost: 2 }));
});
