import assert from "node:assert/strict";
import test from "node:test";
import { deliveryProductsById, deliveryProductMatch } from "../lib/delivery-products";

test("delivery list shows every received product without mixing deliveries", () => {
  const products = deliveryProductsById([
    { deliveryId: "a", productName: "OS1" },
    { deliveryId: "b", productName: "PS1" },
    { deliveryId: "a", productName: "OS2" },
    { deliveryId: "a", productName: "OS1" },
  ]);
  assert.deepEqual(products.get("a"), ["OS1", "OS2"]);
  assert.deepEqual(products.get("b"), ["PS1"]);
  assert.equal(products.get("other"), undefined);
});

test("delivery products retain saved names and ignore empty legacy snapshots", () => {
  assert.deepEqual([...deliveryProductsById([])], []);
  const products = deliveryProductsById([{ deliveryId: "a", productName: " OLD OS1 " }, { deliveryId: "a", productName: "" }, { deliveryId: "", productName: "OS2" }]);
  assert.deepEqual(products.get("a"), ["OLD OS1"]);
});

test("product filtering matches names literally and case-insensitively", () => {
  assert.equal(deliveryProductMatch(null), null);
  assert.equal(deliveryProductMatch("  "), null);
  const filter = deliveryProductMatch(" os1 ")!;
  assert.equal(new RegExp(filter.productName.$regex, filter.productName.$options).test("OS1"), true);
  const special = deliveryProductMatch("C10 (50)")!;
  const expression = new RegExp(special.productName.$regex, special.productName.$options);
  assert.equal(expression.test("C10 (50)"), true);
  assert.equal(expression.test("C10 50"), false);
});
