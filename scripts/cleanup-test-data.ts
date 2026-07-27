// scripts/cleanup-test-data.ts
//
// Removes ONLY the [TEST] data created by scripts/seed-test-data.ts.
// It deletes by the "[TEST]" name prefix and the "TEST-" receipt/transfer
// prefixes, then removes child records (sale lines, items, allocations,
// ledger entries) that belong to those deleted parents. It NEVER touches
// records without those markers, so your real data is safe.
//
// USAGE:
//   npx tsx scripts/cleanup-test-data.ts --confirm
//
// Take an Atlas backup snapshot before running on real data.

import dotenv from "dotenv";
import path from "node:path";
import mongoose from "mongoose";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

import CategoryModel from "@/models/Category";
import SupplierModel from "@/models/Supplier";
import CustomerModel from "@/models/Customer";
import OutletModel from "@/models/Outlet";
import ProductModel from "@/models/Product";
import BodegaProductModel from "@/models/BodegaProduct";
import StandardPackingModel from "@/models/StandardPacking";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import ExpenseModel from "@/models/Expense";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";
import PaymentModel from "@/models/Payment";
import PaymentAllocationModel from "@/models/PaymentAllocation";
import SlicingBatchModel from "@/models/SlicingBatch";
import SlicingItemModel from "@/models/SlicingItem";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import StockTransferModel from "@/models/StockTransfer";
import StockTransferItemModel from "@/models/StockTransferItem";

const TEST_PREFIX = "[TEST]";
const nameRegex = /^\[TEST\]/;
const receiptRegex = /^TEST-/;

function ids(docs: { _id: unknown }[]) {
  return docs.map((d) => d._id);
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error(
      "Refusing to run without --confirm. Usage: npx tsx scripts/cleanup-test-data.ts --confirm"
    );
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Aborting.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected. Removing [TEST] data...\n");

  const M = mongoose.connection;

  // --- find tagged parents first so we can clean their children ---
  const testSales = await (SaleModel as any)
    .find({ receiptNumber: receiptRegex })
    .select("_id")
    .lean();
  const testPayments = await (PaymentModel as any)
    .find({ remarks: nameRegex })
    .select("_id")
    .lean();
  const testBatches = await (SlicingBatchModel as any)
    .find({ remarks: nameRegex })
    .select("_id")
    .lean();
  const testTransfers = await (StockTransferModel as any)
    .find({ transferNumber: receiptRegex })
    .select("_id")
    .lean();

  // --- delete children of those parents ---
  if (testSales.length) {
    await (SaleLineModel as any).deleteMany({ saleId: { $in: ids(testSales) } });
  }
  if (testPayments.length) {
    await (PaymentAllocationModel as any).deleteMany({
      paymentId: { $in: ids(testPayments) },
    });
  }
  if (testBatches.length) {
    await (SlicingItemModel as any).deleteMany({
      batchId: { $in: ids(testBatches) },
    });
  }
  if (testTransfers.length) {
    await (StockTransferItemModel as any).deleteMany({
      transferId: { $in: ids(testTransfers) },
    });
  }

  // --- ledger entries written with [TEST] remarks ---
  await (BodegaStockTransactionModel as any).deleteMany({ remarks: nameRegex });
  await (InventoryTransactionModel as any).deleteMany({ remarks: nameRegex });
  await (OutletStockTransactionModel as any).deleteMany({ remarks: nameRegex });

  // --- delete the tagged parents and standalone tagged records ---
  const results: Record<string, number> = {};

  results.sales = (await (SaleModel as any).deleteMany({ receiptNumber: receiptRegex }))
    .deletedCount;
  results.payments = (await (PaymentModel as any).deleteMany({ remarks: nameRegex }))
    .deletedCount;
  results.slicingBatches = (
    await (SlicingBatchModel as any).deleteMany({ remarks: nameRegex })
  ).deletedCount;
  results.stockTransfers = (
    await (StockTransferModel as any).deleteMany({ transferNumber: receiptRegex })
  ).deletedCount;

  results.expenses = (await (ExpenseModel as any).deleteMany({ name: nameRegex }))
    .deletedCount;

  // Standard packing has no name; remove the ones pointing at [TEST] products
  // (handled below by deleting after products, using product ids).
  const testBodega = await (BodegaProductModel as any)
    .find({ name: nameRegex })
    .select("_id")
    .lean();
  if (testBodega.length) {
    results.standardPacking = (
      await (StandardPackingModel as any).deleteMany({
        productId: { $in: ids(testBodega) },
      })
    ).deletedCount;
  }

  // Outlet inventory + outlets + remaining named records
  results.outletInventory = (
    await (OutletInventoryModel as any).deleteMany({ productName: nameRegex })
  ).deletedCount;
  results.bodegaProducts = (
    await (BodegaProductModel as any).deleteMany({ name: nameRegex })
  ).deletedCount;
  results.groceryProducts = (
    await (ProductModel as any).deleteMany({ name: nameRegex })
  ).deletedCount;
  results.outlets = (await (OutletModel as any).deleteMany({ name: nameRegex }))
    .deletedCount;
  results.customers = (await (CustomerModel as any).deleteMany({ name: nameRegex }))
    .deletedCount;
  results.suppliers = (await (SupplierModel as any).deleteMany({ name: nameRegex }))
    .deletedCount;
  results.categories = (await (CategoryModel as any).deleteMany({ name: nameRegex }))
    .deletedCount;

  console.log("Removed:");
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k}: ${v}`);
  }

  void M;
  void TEST_PREFIX;

  await mongoose.disconnect();
  console.log("\nCleanup complete. Your real (non-[TEST]) data was not touched.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
