import test from "node:test";
import assert from "node:assert/strict";
import { mainProductionCost } from "../lib/main-production-cost";

test("whole chicken is costed per kilo, ingredients per stock unit, output per actual kilo", () => {
  const result = mainProductionCost([{ whole: true, quantity: 10, kilos: 15, unitCost: 150 }, { whole: false, quantity: 3, unitCost: 150 }], 12);
  assert.equal(result.totalCost, 2700); assert.equal(result.costPerKilo, 225); assert.equal(result.weightedCost, 225);
});
test("existing finished inventory retains its value with weighted cost", () => {
  const result = mainProductionCost([{ whole: true, quantity: 10, kilos: 15, unitCost: 150 }], 10, 5, 200);
  assert.equal(result.weightedCost, (2250 + 1000) / 15);
});
test("fractional output kilos and measured ingredients are allowed", () => {
  assert.equal(mainProductionCost([{ whole: false, quantity: 1.5, unitCost: 100 }], 2.5).costPerKilo, 60);
});
test("allocated labor/overhead is capitalized once into finished kilos", () => {
  const cost = mainProductionCost([{ whole: true, quantity: 10, kilos: 15, unitCost: 150 }, { whole: false, quantity: 1, unitCost: 300 }], 12);
  assert.equal(cost.totalCost, 2550); assert.equal(cost.costPerKilo, 212.5);
});
test("invalid amounts and missing whole chicken kilos are rejected", () => {
  for (const kilos of [0, -1, NaN, Infinity]) assert.throws(() => mainProductionCost([{ whole: false, quantity: 1, unitCost: 1 }], kilos));
  assert.throws(() => mainProductionCost([], 1));
  assert.throws(() => mainProductionCost([{ whole: true, quantity: 1, unitCost: 100 }], 1));
  assert.throws(() => mainProductionCost([{ whole: true, quantity: 1.5, kilos: 2, unitCost: 100 }], 1));
  assert.throws(() => mainProductionCost([{ whole: false, quantity: 1, unitCost: -1 }], 1));
});
