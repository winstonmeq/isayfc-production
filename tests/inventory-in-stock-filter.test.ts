import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("both inventory pages offer In Stock alongside the existing filters", () => {
  for (const file of ["components/inventory/BodegaStockMovementPageClient.tsx", "components/inventory/ProductInventoryPageClient.tsx"]) {
    const source = readFileSync(file, "utf8");
    for (const value of ["ALL", "IN_STOCK", "LOW", "OUT"]) assert.ok(source.includes(`SelectItem value="${value}"`));
  }
});
test("In Stock includes positive quantities, including low stock, and excludes zero stock", () => {
  const bodega = readFileSync("app/api/inventory/bodega/route.ts", "utf8");
  const grocery = readFileSync("app/api/inventory/products/route.ts", "utf8");
  assert.match(bodega, /stockStatus === "IN_STOCK"\s*\? row.currentStock > 0/);
  assert.match(grocery, /stockStatus === "IN_STOCK"\)\s*\{\s*filter.stockPcs = \{ \$gt: 0 \}/);
});
