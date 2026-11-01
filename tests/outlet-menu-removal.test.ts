import test from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import OutletMenuItem from "../models/OutletMenuItem";
import { outletMenuMutation } from "../lib/outlet-menu-mutation";
import { removeOutletMenuItem } from "../lib/remove-outlet-menu-item";

test("trash sends DELETE for the outlet menu ID, never an assign/create request", () => {
  const request = outletMenuMutation("REMOVE", "outlet-a", "menu-a");
  assert.deepEqual(request, { method: "DELETE", body: { outletId: "outlet-a", menuItemId: "menu-a" } });
  assert.equal("catalogItemId" in request.body, false);
  assert.equal(outletMenuMutation("ASSIGN", "outlet-a", "catalog-a", 12).method, "POST");
  assert.equal(outletMenuMutation("UPDATE", "outlet-a", "menu-a", 12).body.menuItemId, "menu-a");
});
test("remove is scoped, repeatable, and only disables menu availability without stock/history writes", async (t) => {
  const outletId = String(new Types.ObjectId()), menuItemId = String(new Types.ObjectId());
  let updates = 0;
  t.mock.method(OutletMenuItem, "findOneAndUpdate", async (filter: unknown, update: unknown, options: unknown) => {
    updates++;
    assert.deepEqual(filter, { _id: menuItemId, outletId });
    assert.deepEqual(update, { $set: { isActive: false, isAvailable: false } });
    assert.deepEqual(options, { new: true });
    return { _id: menuItemId, outletId, isActive: false, isAvailable: false };
  });
  t.mock.method(OutletMenuItem, "create", () => { throw new Error("Removal must never add a menu item"); });
  await removeOutletMenuItem(outletId, menuItemId);
  await removeOutletMenuItem(outletId, menuItemId);
  assert.equal(updates, 2);
  assert.equal(await removeOutletMenuItem("invalid", menuItemId), null);
  assert.equal(updates, 2);
});
