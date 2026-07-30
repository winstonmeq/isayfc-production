import assert from "node:assert/strict";
import test from "node:test";

import {
  getSlicingKiloIssue,
  getSlicingKiloRange,
  getSlicingVariance,
} from "../lib/slicing-validation";

test("keeps a negative slicing variance instead of converting it to zero", () => {
  assert.equal(getSlicingVariance(350, 360), -10);
});

test("calculates positive and zero slicing variances", () => {
  assert.equal(getSlicingVariance(1_100, 1_080), 20);
  assert.equal(getSlicingVariance(350, 350), 0);
});

test("multiplies kg/bag standards by the entered bag count", () => {
  const range = getSlicingKiloRange(5, 15, 16);

  assert.equal(range.minimumTotalKilos, 75);
  assert.equal(range.maximumTotalKilos, 80);
});

test("rejects a bag weight below the standard minimum", () => {
  const issue = getSlicingKiloIssue({
    bags: 5,
    kilosPerBag: 14.5,
    minimumKilosPerBag: 15,
    maximumKilosPerBag: 16,
  });

  assert.equal(issue?.kind, "below-minimum");
  assert.equal(issue?.minimumTotalKilos, 75);
});

test("rejects a bag weight above the standard maximum", () => {
  const issue = getSlicingKiloIssue({
    bags: 5,
    kilosPerBag: 16.5,
    minimumKilosPerBag: 15,
    maximumKilosPerBag: 16,
  });

  assert.equal(issue?.kind, "above-maximum");
  assert.equal(issue?.maximumTotalKilos, 80);
});

test("accepts a bag weight inside the standard range", () => {
  const issue = getSlicingKiloIssue({
    bags: 5,
    kilosPerBag: 15,
    minimumKilosPerBag: 15,
    maximumKilosPerBag: 16,
  });

  assert.equal(issue, null);
});

test("supports standards with no configured kilo limits", () => {
  const issue = getSlicingKiloIssue({
    bags: 5,
    kilosPerBag: 0,
    minimumKilosPerBag: 0,
    maximumKilosPerBag: 0,
  });

  assert.equal(issue, null);
});
