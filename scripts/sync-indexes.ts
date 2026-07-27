// scripts/sync-indexes.ts
//
// Makes the schema's indexes REAL on an existing database. Needed because
// Mongoose autoIndex silently swallows index-build failures, and two of this
// codebase's guards depend on unique indexes that will NOT build on their own:
//
//   * Sale.receiptNumber changed from a plain index to UNIQUE — Mongo rejects
//     the change (IndexOptionsConflict) because the old non-unique index with
//     the same name already exists. Until it's dropped and rebuilt, duplicate
//     receipt numbers are possible and the sales routes' E11000 retry is dead
//     code.
//   * CashShift's one-OPEN-shift-per-cashier partial unique index fails to
//     build if any cashier already has two OPEN shifts.
//   * OutletStockTransaction gained a {outletId, idempotencyKey} partial
//     unique index guarding repack/stock-in retries.
//
// This script (1) reports data that would block the unique builds, then
// (2) runs syncIndexes() per model and prints the outcome loudly.
//
// USAGE:  npx tsx scripts/sync-indexes.ts
// Run it once per deploy whenever schema indexes change.

import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required in .env.");

  const { default: dbConnect } = await import("../lib/mongodb");
  const { default: SaleModel } = await import("../models/Sale");
  const { default: CashShiftModel } = await import("../models/CashShift");
  const { default: OutletStockTransactionModel } = await import(
    "../models/OutletStockTransaction"
  );
  const { default: CustomerModel } = await import("../models/Customer");
  const { default: StockTransferModel } = await import("../models/StockTransfer");

  await dbConnect();

  let blocked = false;

  // --- Pre-flight: data that would make the unique builds fail ---

  const dupReceipts = await SaleModel.aggregate<{ _id: string; count: number }>([
    { $group: { _id: "$receiptNumber", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 },
  ]);
  if (dupReceipts.length > 0) {
    blocked = true;
    console.log("\n⚠ DUPLICATE receipt numbers found (unique index will fail):");
    for (const d of dupReceipts) {
      console.log(`  - ${d._id} × ${d.count}`);
    }
    console.log(
      "  Fix these first (e.g. suffix the duplicates), then re-run this script."
    );
  }

  const dupOpenShifts = await CashShiftModel.aggregate<{
    _id: unknown;
    count: number;
  }>([
    { $match: { status: "OPEN" } },
    { $group: { _id: "$cashierId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  if (dupOpenShifts.length > 0) {
    blocked = true;
    console.log("\n⚠ Cashiers with MULTIPLE OPEN shifts (unique index will fail):");
    for (const d of dupOpenShifts) {
      console.log(`  - cashierId ${d._id} has ${d.count} OPEN shifts`);
    }
    console.log(
      "  Run: npx tsx scripts/close-open-shifts.ts --close  then re-run this script."
    );
  }

  const duplicateOutletCustomers = await CustomerModel.aggregate<{
    _id: unknown;
    count: number;
  }>([
    { $match: { outletId: { $exists: true, $ne: null } } },
    { $group: { _id: "$outletId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  if (duplicateOutletCustomers.length > 0) {
    blocked = true;
    console.log("\nDuplicate customer-to-outlet links found:");
    for (const duplicate of duplicateOutletCustomers) {
      console.log(
        `  - outletId ${duplicate._id} is linked to ${duplicate.count} customers`
      );
    }
  }

  const duplicateSaleTransfers = await StockTransferModel.aggregate<{
    _id: unknown;
    count: number;
  }>([
    { $match: { saleId: { $exists: true, $ne: null } } },
    { $group: { _id: "$saleId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  if (duplicateSaleTransfers.length > 0) {
    blocked = true;
    console.log("\nDuplicate sale-to-transfer links found:");
    for (const duplicate of duplicateSaleTransfers) {
      console.log(
        `  - saleId ${duplicate._id} is linked to ${duplicate.count} transfers`
      );
    }
  }

  if (blocked) {
    console.log("\nAttempting sync anyway — conflicting indexes are still updated;");
    console.log("only the blocked unique builds will fail below.\n");
  }

  // --- Sync (drops indexes not in the schema, builds the schema's ones) ---

  const models = [
    ["Sale", SaleModel],
    ["CashShift", CashShiftModel],
    ["OutletStockTransaction", OutletStockTransactionModel],
    ["Customer", CustomerModel],
    ["StockTransfer", StockTransferModel],
  ] as const;

  let failures = 0;
  for (const [name, model] of models) {
    try {
      const dropped = await (model as any).syncIndexes();
      console.log(
        `✔ ${name}: indexes synced${
          Array.isArray(dropped) && dropped.length
            ? ` (dropped stale: ${dropped.join(", ")})`
            : ""
        }`
      );
    } catch (e: any) {
      failures += 1;
      console.error(`✘ ${name}: ${e?.message || e}`);
    }
  }

  if (failures > 0) {
    console.error(
      "\nSome indexes FAILED to build — the guards that depend on them are NOT active."
    );
    process.exit(1);
  }

  console.log("\nAll indexes in sync.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
