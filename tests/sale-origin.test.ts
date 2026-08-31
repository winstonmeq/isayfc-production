import assert from "node:assert/strict";
import test from "node:test";

import {
  getOutletCode,
  getSaleOrigin,
  getSaleSourceLabel,
  outletSaleMatchClauses,
} from "../lib/sale-origin";

test("labels web sales by their business product type", () => {
  assert.equal(getSaleOrigin({ source: "CHICKEN" }), "CHICKEN");
  assert.equal(getSaleOrigin({ source: "BODEGA" }), "GROCERY");
  assert.equal(getSaleOrigin({ source: "MIXED" }), "CHICKEN + GROCERY");
});

test("labels only actual mobile/outlet sales as outlet activity", () => {
  assert.equal(getSaleOrigin({ source: "OUTLET" }), "OUTLET");
  assert.equal(
    getSaleOrigin({ source: "BODEGA", receiptNumber: "MOB-20260815-0001" }),
    "OUTLET"
  );
  assert.equal(
    getSaleOrigin({ source: "CHICKEN", outletId: "outlet-id" }),
    "CHICKEN"
  );
});

test("outlet matching does not mistake a main sale linked to an outlet", () => {
  const clauses = JSON.stringify(outletSaleMatchClauses());
  assert.equal(clauses.includes("outletId"), false);
  assert.equal(clauses.includes("MOB-"), true);
});

test("adds the linked outlet code to the visible sale source", () => {
  const sale = {
    source: "BODEGA",
    channel: "MOBILE",
    outletId: { name: "Branch Four", code: "B4" },
  };

  assert.equal(getOutletCode(sale), "B4");
  assert.equal(getSaleSourceLabel(sale), "OUTLET-B4");
  assert.equal(
    getSaleSourceLabel({
      source: "OUTLET",
      outletId: { name: "Branch Four", code: "B4" },
    }),
    "OUTLET-B4"
  );
  assert.equal(getSaleSourceLabel({ source: "CHICKEN" }), "CHICKEN");
});
