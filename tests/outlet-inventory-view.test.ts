import test from "node:test";
import assert from "node:assert/strict";
import { outletInventoryView, filterOutletInventory } from "../lib/outlet-inventory-view";
import { paginateTable } from "../lib/table-pagination";

test("received raw stock does not become finished stock through a similarly named menu", () => {
  assert.deepEqual(outletInventoryView({ productId: "raw-1", originType: "TRANSFER" }, { _id: "menu-1", price: 15, isActive: true, isAvailable: true }), { stockKind: "INGREDIENT", sellingPrice: null, menuAvailable: false });
  assert.equal(outletInventoryView({ productId: "outside-1", originType: "OUTSIDE_PURCHASE" }).stockKind, "INGREDIENT");
});
test("production and legacy menu-linked stocks appear as finished products", () => {
  assert.equal(outletInventoryView({ originType: "OUTLET_PRODUCTION" }).stockKind, "FINISHED");
  assert.equal(outletInventoryView({ remarks: "MIXING OUTPUT" }).stockKind, "FINISHED");
  assert.deepEqual(outletInventoryView({ productId: "menu-1" }, { _id: "menu-1", price: 0, isActive: true, isAvailable: true }), { stockKind: "FINISHED", sellingPrice: 0, menuAvailable: true });
});
test("disabled or removed menus do not hide existing finished stock or mark it sellable", () => {
  const stock = { productId: "menu-1", originType: "OUTLET_PRODUCTION" };
  for (const menu of [{ _id: "menu-1", price: 12, isActive: true, isAvailable: false }, { _id: "menu-1", price: 12, isActive: false, isAvailable: true }]) {
    const result = outletInventoryView(stock, menu);
    assert.equal(result.stockKind, "FINISHED");
    assert.equal(result.menuAvailable, false);
    assert.equal(result.sellingPrice, 12);
  }
});
test("tabs, search and pagination filter existing stock without changing records", () => {
  const items = Array.from({ length: 202 }, (_, index) => ({ id: index, productName: `Product ${index}`, categoryName: index % 2 ? "Chicken" : "Supplies", productSource: "OUTLET-A", stockKind: index % 2 ? "FINISHED" : "INGREDIENT", stockQty: 3 }));
  const before = JSON.stringify(items);
  const finished = filterOutletInventory(items, "FINISHED", "chicken");
  assert.equal(finished.length, 101);
  assert.equal(filterOutletInventory(items, "INGREDIENT", "supplies").length, 101);
  assert.equal(filterOutletInventory(items, "ALL", "OUTLET-A").length, 202);
  assert.equal(paginateTable(finished).rows.length, 25);
  assert.equal(paginateTable(finished, 5).rows.length, 1);
  assert.equal(JSON.stringify(items), before);
  assert.deepEqual(filterOutletInventory([], "FINISHED", ""), []);
});
