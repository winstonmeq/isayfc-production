import test from "node:test";
import assert from "node:assert/strict";
import { isInventorySourceCategory, bodegaSaleAvailability } from "../lib/product-classification";

test("inventory sources are not product categories", () => {
  for (const name of ["Bodega", " GROCERY ", "Outlet"]) assert.equal(isInventorySourceCategory(name), true);
  for (const name of ["Chicken", "Chicken Cuts", "Plastic", "Gloves", "Ingredients"]) assert.equal(isInventorySourceCategory(name), false);
});
test("bodega availability follows units and packing, not category names", () => {
  assert.deepEqual(bodegaSaleAvailability({ stockQty: 120 }, 50), { saleUnit: "PACK", availableQty: 2 });
  assert.deepEqual(bodegaSaleAvailability({ stockQty: 20, stockHeads: 10 }, 0), { saleUnit: "HEAD", availableQty: 10 });
  assert.deepEqual(bodegaSaleAvailability({ unitCode: "PCS", stockQty: 20, stockHeads: 0 }, 0), { saleUnit: "QTY", availableQty: 20 });
});
