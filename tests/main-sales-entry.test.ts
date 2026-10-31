import assert from "node:assert/strict";
import test from "node:test";
import { canonicalMainSaleRoute, filterMainSaleProducts, mainSaleSource } from "../lib/main-sales-entry";
import { appNavItems } from "../components/app-shell/nav-config";

test("sales navigation has one entry page and retains monitoring/setup modules", () => {
  const children = appNavItems.find((item) => item.title === "Sales")!.children!;
  assert.deepEqual(children.map((item) => item.title), ["Sales History", "New Sale", "Discount Setup", "Sales Per Item", "Outlet Deliveries"]);
  assert.equal(children.find((item) => item.title === "New Sale")?.permission, "sales.manage");
  assert.equal(children.find((item) => item.title === "New Sale")?.href, "/sales/all");
});

test("legacy sales entry bookmarks normalize without changing history/report routes", () => {
  for (const route of ["/sales", "/sales/grocery", "/sales/all"]) assert.equal(canonicalMainSaleRoute(route), "/sales/all");
  for (const route of ["/sales/history", "/sales/lines", "/sales/discounts", "/pos"]) assert.equal(canonicalMainSaleRoute(route), route);
});

test("product filters affect selection only; mixed carts preserve per-product sale types", () => {
  const products = [{ type: "CHICKEN" as const, name: "C10" }, { type: "BODEGA" as const, name: "Oil" }];
  assert.deepEqual(filterMainSaleProducts(products, "CHICKEN"), [products[0]]);
  assert.deepEqual(filterMainSaleProducts(products, "BODEGA"), [products[1]]);
  assert.equal(filterMainSaleProducts(products, "ALL"), products);
  assert.equal(mainSaleSource([products[0]]), "CHICKEN");
  assert.equal(mainSaleSource([products[1]]), "BODEGA");
  assert.equal(mainSaleSource(products), "MIXED");
  assert.equal(products.length, 2);
});
