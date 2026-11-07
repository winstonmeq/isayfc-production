import test from "node:test";
import assert from "node:assert/strict";
import { chickenRelease } from "../lib/chicken-release";
import { bodegaSaleAvailability } from "../lib/product-classification";
test("head sales carry actual kilo cost, not kilo price as head cost", () => {
  const release = chickenRelease(2, 3.5, 10, 15, 150);
  assert.equal(release.costPerHead, 262.5); assert.equal(release.kilosOut, 3.5);
  assert.equal(release.costPerHead * 2, 525);
});
test("heads and kilos stay consistent and shortages are rejected", () => {
  for (const args of [[1, NaN, 10, 15, 150], [11, 2, 10, 15, 150], [1, 16, 10, 15, 150], [10, 14, 10, 15, 150], [9, 15, 10, 15, 150]]) assert.throws(() => chickenRelease(...args as [number,number,number,number,number]));
  assert.equal(chickenRelease(10, 15, 10, 15, 150).costPerHead, 225);
});
test("finished Bodega kilo products preserve fractional sale availability", () => {
  assert.deepEqual(bodegaSaleAvailability({ unitCode: "KG", stockQty: 12.75 }, 0), { saleUnit: "KG", availableQty: 12.75 });
});
