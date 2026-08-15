import assert from "node:assert/strict";
import test from "node:test";

import {
  getOutletCode,
  getSaleOrigin,
  getSaleSourceLabel,
} from "../lib/sale-origin";

test("labels web sales by their business product type", () => {
  assert.equal(getSaleOrigin({ source: "CHICKEN" }), "CHICKEN");
  assert.equal(getSaleOrigin({ source: "BODEGA" }), "GROCERY");
  assert.equal(getSaleOrigin({ source: "MIXED" }), "CHICKEN + GROCERY");
});

test("labels mobile and linked-outlet sales as outlet activity", () => {
  assert.equal(
    getSaleOrigin({ source: "BODEGA", receiptNumber: "MOB-20260815-0001" }),
    "OUTLET"
  );
  assert.equal(
    getSaleOrigin({ source: "CHICKEN", outletId: "outlet-id" }),
    "OUTLET"
  );
});

test("adds the linked outlet code to the visible sale source", () => {
  const sale = {
    source: "BODEGA",
    channel: "MOBILE",
    outletId: { name: "Branch Four", code: "B4" },
  };

  assert.equal(getOutletCode(sale), "B4");
  assert.equal(getSaleSourceLabel(sale), "OUTLET-B4");
  assert.equal(getSaleSourceLabel({ source: "CHICKEN" }), "CHICKEN");
});
