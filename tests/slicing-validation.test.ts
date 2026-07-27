import assert from "node:assert/strict";
import test from "node:test";

import {
  getSlicingKiloIssue,
  getSlicingKiloRange,
} from "../lib/slicing-validation";

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
