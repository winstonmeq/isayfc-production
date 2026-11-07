import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getSlicingVariance } from "../lib/slicing-validation";

test("136 percent is a positive variance, not an invalid piece-count yield", () => {
  assert.equal(136 / 100 * 100, 136);
  assert.equal(getSlicingVariance(136, 100), 36);
});

for (const file of ["components/slicing/AddSlicingPageClient.tsx", "app/api/slicing/route.ts", "app/api/slicing/batches/route.ts"]) {
  test(`${file} has no yield-range saving gate and retains count validation`, () => {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /MIN_SLICING_YIELD_RATE|MAX_SLICING_YIELD_RATE|Recount before saving|Please recount before saving/);
    assert.match(source, /actualSlicedPcs <= 0/);
    assert.match(source, /Number\.isInteger\(actualSlicedPcs\)/);
    assert.match(source, /MAX_HEADS_PER_ROW/);
  });
}
