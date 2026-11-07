import test from "node:test";
import assert from "node:assert/strict";
import { chickenRelease, resolveChickenRelease } from "../lib/chicken-release";
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

test("head sale without entered kilos estimates inventory weight, not the selling quantity", () => {
  const release = resolveChickenRelease(3, undefined, 10, 15, 150);
  assert.equal(release.kilosOut, 4.5);
  assert.equal(release.weightBasis, "ESTIMATED");
  assert.equal(release.costPerHead, 225);
  assert.equal(3 * 168, 504); // per-head revenue is independent of estimated weight
});

test("explicit actual weight overrides the estimate and remains strictly validated", () => {
  assert.equal(resolveChickenRelease(3, 5, 10, 15, 150).weightBasis, "ACTUAL");
  assert.equal(resolveChickenRelease(3, 5, 10, 15, 150).kilosOut, 5);
  for (const kilos of [0, -1, NaN, "invalid", 16]) assert.throws(() => resolveChickenRelease(3, kilos, 10, 15, 150));
});

test("final head sale consumes remaining kilos without leaving residual weight", () => {
  const release = resolveChickenRelease(7, "", 7, 10.1234567, 150);
  assert.equal(release.kilosOut, 10.1234567);
  assert.throws(() => resolveChickenRelease(11, undefined, 10, 15, 150));
});

test("weight estimation does not invent stock when heads or kilos are missing", () => {
  assert.throws(() => resolveChickenRelease(1, undefined, 0, 15, 150));
  assert.throws(() => resolveChickenRelease(1, undefined, 10, 0, 150));
});
