// scripts/seed-test-data.ts
//
// Seeds realistic [TEST] data across the whole system so you can click through
// every feature. SAFE for a database that already has real data:
//
//   * Every record it creates is marked with the "[TEST]" prefix in its name
//     (and test sales/payments use a TEST- receipt/reference prefix).
//   * It NEVER deletes or edits anything. It only inserts.
//   * It refuses to run without the --confirm flag.
//   * A matching remover (scripts/cleanup-test-data.ts) deletes ONLY the
//     [TEST] records it created, leaving your real data untouched.
//
// USAGE (from project root, with production/Atlas MONGODB_URI in your env):
//   npx tsx scripts/seed-test-data.ts --confirm
//
// To remove it all again:
//   npx tsx scripts/cleanup-test-data.ts --confirm
//
// Always take an Atlas backup snapshot before running anything on real data.

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
import UserModel from "@/models/User";

export const TEST_PREFIX = "[TEST]";

function daysAgo(n: number) {
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  return new Date(d.getTime() - n * 24 * 60 * 60 * 1000);
}

function pick<T>(arr: T[], i: number) {
  return arr[i % arr.length];
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const DAYS = 10;

const CUSTOMER_NAMES = [
  "Aling Nena Carinderia",
  "Kuya Boy Eatery",
  "Mang Inasal Toril",
  "Davao Lutong Bahay",
  "Lola Rosing Turo-Turo",
  "JJ Grill House",
  "Bankerohan Fresh Mart",
  "Matina Food Hub",
  "Panabo Chicken Haus",
  "Tagum Meat Supply",
];

const OUTLET_DEFS = [
  { name: "Toril Branch", code: "TEST-TORIL", manager: "Manang Rosa" },
  { name: "Matina Branch", code: "TEST-MATINA", manager: "Mang Tonio" },
  { name: "Bajada Branch", code: "TEST-BAJADA", manager: "Ate Lyn" },
  { name: "Buhangin Branch", code: "TEST-BUHANGIN", manager: "Kuya Ramon" },
  { name: "Panabo Branch", code: "TEST-PANABO", manager: "Sir Dado" },
];

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error(
      "Refusing to run without --confirm. Usage: npx tsx scripts/seed-test-data.ts --confirm"
    );
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set (check your .env). Aborting.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected. Seeding heavy 10-day [TEST] dataset...\n");

  const admin = await UserModel.findOne({ role: "ADMIN" }).select("_id").lean();
  const createdBy = admin?._id;

  // ---- Categories ----------------------------------------------------------
  const [catChicken, catGrocery] = await (CategoryModel as any).create([
    { name: `${TEST_PREFIX} Chicken Parts`, description: "Test category" },
    { name: `${TEST_PREFIX} Grocery Items`, description: "Test category" },
  ]);
  console.log("Categories: 2");

  // ---- Suppliers -----------------------------------------------------------
  await (SupplierModel as any).create([
    { name: `${TEST_PREFIX} Davao Poultry Supply`, phone: "0917-000-1111", address: "Bankerohan, Davao City" },
    { name: `${TEST_PREFIX} Mindanao Grocery Distributor`, phone: "0917-222-3333", address: "Agdao, Davao City" },
  ]);
  console.log("Suppliers: 2");

  // ---- 10 Customers --------------------------------------------------------
  const customers: any[] = await (CustomerModel as any).create(
    CUSTOMER_NAMES.map((name, i) => ({
      name: `${TEST_PREFIX} ${name}`,
      phone: `0918-${String(100 + i).padStart(3, "0")}-${String(1000 + i)}`,
      address: "Davao Region",
      type: i % 3 === 0 ? "BOTH" : "SALE",
      createdBy,
    }))
  );
  console.log(`Customers: ${customers.length}`);

  // ---- 5 Outlets -----------------------------------------------------------
  const outlets: any[] = await (OutletModel as any).create(
    OUTLET_DEFS.map((o) => ({
      name: `${TEST_PREFIX} ${o.name}`,
      code: o.code,
      address: `${o.name} Public Market`,
      managerName: o.manager,
      contactNumber: "0920-000-0000",
      status: "ACTIVE",
      createdBy,
    }))
  );
  console.log(`Outlets: ${outlets.length}`);

  // ---- Grocery products ----------------------------------------------------
  const groceryProducts: any[] = await (ProductModel as any).create([
    { name: `${TEST_PREFIX} Cooking Oil 1L`, categoryId: catGrocery._id, buyingPrice: 85, unitPrice: 110, stockPcs: 5000, lowStockAlert: 50 },
    { name: `${TEST_PREFIX} Soy Sauce 1L`, categoryId: catGrocery._id, buyingPrice: 40, unitPrice: 60, stockPcs: 5000, lowStockAlert: 50 },
    { name: `${TEST_PREFIX} Rice 25kg`, categoryId: catGrocery._id, buyingPrice: 1200, unitPrice: 1450, stockPcs: 1000, lowStockAlert: 20 },
    { name: `${TEST_PREFIX} Vinegar 1L`, categoryId: catGrocery._id, buyingPrice: 30, unitPrice: 48, stockPcs: 5000, lowStockAlert: 50 },
  ]);
  console.log(`Grocery products: ${groceryProducts.length}`);

  // ---- Bodega products: OS1, OS4 (raw whole chicken, per head) + C10 -------
  // OS1 and OS4 are raw whole-chicken types counted PER HEAD.
  // C10 is the sliced output, sold/transferred in PACKS (50 pcs/pack), P377/pack.
  const os1 = await (BodegaProductModel as any).create({
    name: `${TEST_PREFIX} OS1`, categoryId: catChicken._id, stockQty: 2000, buyingPrice: 150, sellingPrice: 0,
  });
  const os4 = await (BodegaProductModel as any).create({
    name: `${TEST_PREFIX} OS4`, categoryId: catChicken._id, stockQty: 2000, buyingPrice: 175, sellingPrice: 0,
  });
  const c10 = await (BodegaProductModel as any).create({
    name: `${TEST_PREFIX} C10`, categoryId: catChicken._id, stockQty: 0, buyingPrice: 300, sellingPrice: 377,
  });
  console.log("Bodega products: 3 (OS1, OS4 raw heads; C10 packed @ P377)");

  // Two slicing standards, both produce C10 packed at 50 pcs/pack:
  //   OS1 -> C10: slice 26 pcs/head
  //   OS4 -> C10: slice 34 pcs/head
  const C10_PACK = 50;
  const packingOS1 = await (StandardPackingModel as any).create({
    wholeChickenId: os1._id, productId: c10._id, standardPacking: C10_PACK, standardSlice: 26, chickenSizeType: "OS1",
  });
  const packingOS4 = await (StandardPackingModel as any).create({
    wholeChickenId: os4._id, productId: c10._id, standardPacking: C10_PACK, standardSlice: 34, chickenSizeType: "OS4",
  });
  console.log("Standard packings: 2 (OS1->C10 slice 26/pack 50, OS4->C10 slice 34/pack 50)");

  // Running stock trackers (kept positive)
  let c10Stock = 0;
  let os1Stock = 2000;
  let os4Stock = 2000;
  const groceryStock = groceryProducts.map((p: any) => Number(p.stockPcs));

  // ---- Per-day slicing (replenish C10) -------------------------------------
  let slicingCount = 0;
  const EXPENSE_TYPES_BODEGA = ["SALARIES", "MARINATE_EXPENSES", "DELIVERY_EXPENSES", "REPAIR_AND_MAINTENANCE"];
  const EXPENSE_TYPES_GROCERY = ["TRANSPORTATION_EXPENSES", "CLEANING_SUPPLIES", "OFFICE_SUPPLIES", "OTHERS"];

  let saleSeq = 0;
  let transferSeq = 0;
  let totalSales = 0;
  let totalPayments = 0;
  let totalExpenses = 0;
  let totalTransfers = 0;

  for (let d = DAYS; d >= 1; d -= 1) {
    const date = daysAgo(d);

    // --- Slicing: 1-2 batches/day, alternating OS1/OS4 -> C10 ---
    const batchesToday = randInt(1, 2);
    for (let b = 0; b < batchesToday; b += 1) {
      // Alternate which raw head we slice from.
      const useOS1 = (slicingCount + b) % 2 === 0;
      const mainProduct = useOS1 ? os1 : os4;
      const standard = useOS1 ? packingOS1 : packingOS4;
      const standardSlice = useOS1 ? 26 : 34;

      const heads = randInt(20, 40);
      // Actual sliced pcs ~= heads * slice, with a little real-world variance.
      const actualSlicedPcs = heads * standardSlice - randInt(0, heads);
      const totalStd = heads * standardSlice;
      const actualPacks = Math.floor(actualSlicedPcs / C10_PACK);
      const butal = actualSlicedPcs % C10_PACK;
      const variance = actualSlicedPcs - totalStd;

      const prevMain = useOS1 ? os1Stock : os4Stock;

      const batch = await (SlicingBatchModel as any).create({
        slicingDate: date,
        slicer: `${TEST_PREFIX} Slicer ${(b % 2) + 1}`,
        packer: `${TEST_PREFIX} Packer ${(b % 2) + 1}`,
        totalHeads: heads,
        totalStdPcs: totalStd,
        totalActualPcs: actualSlicedPcs,
        totalPacks: actualPacks,
        totalButal: butal,
        totalVariance: variance,
        remarks: `${TEST_PREFIX} Slicing batch (${useOS1 ? "OS1" : "OS4"} -> C10)`,
        createdBy,
      });
      await (SlicingItemModel as any).create({
        batchId: batch._id,
        standardId: standard._id,
        mainProductId: mainProduct._id,
        mainProductName: mainProduct.name,
        slicedProductId: c10._id,
        slicedProductName: c10.name,
        heads,
        standardSlice,
        standardPacking: C10_PACK,
        totalStdPcs: totalStd,
        actualSlicedPcs,
        actualPacks,
        butal,
        variance,
      });

      // Stock effect: deduct heads from OS1/OS4, add sliced pcs to C10.
      await (BodegaProductModel as any).updateOne({ _id: mainProduct._id }, { $inc: { stockQty: -heads } });
      await (BodegaProductModel as any).updateOne({ _id: c10._id }, { $inc: { stockQty: actualSlicedPcs } });
      await (BodegaStockTransactionModel as any).create([
        { bodegaProductId: mainProduct._id, type: "STOCK_OUT", quantity: heads, previousStock: prevMain, newStock: prevMain - heads, remarks: `${TEST_PREFIX} SLICING`, referenceType: "SLICING_BATCH", referenceId: batch._id, createdBy },
        { bodegaProductId: c10._id, type: "STOCK_IN", quantity: actualSlicedPcs, previousStock: c10Stock, newStock: c10Stock + actualSlicedPcs, remarks: `${TEST_PREFIX} SLICING`, referenceType: "SLICING_BATCH", referenceId: batch._id, createdBy },
      ]);

      if (useOS1) os1Stock -= heads; else os4Stock -= heads;
      c10Stock += actualSlicedPcs;
      slicingCount += 1;
    }

    // --- Sales: 8-14 per day across random customers (HEAVY) ---
    const salesToday = randInt(8, 14);
    for (let s = 0; s < salesToday; s += 1) {
      const customer = pick(customers, randInt(0, customers.length - 1));
      const isChicken = Math.random() < 0.55;
      saleSeq += 1;
      const receiptNumber = `TEST-${String(saleSeq).padStart(5, "0")}`;

      if (isChicken) {
        // Sell C10 in PACKS at P377/pack (50 pcs per pack).
        const packs = randInt(1, 6);
        const pcs = packs * C10_PACK;
        if (c10Stock < pcs) continue;
        const price = 377;
        const total = price * packs;
        const paid = Math.random() < 0.7;

        const sale = await (SaleModel as any).create({
          receiptNumber, customerId: customer._id, saleDate: date, source: "CHICKEN",
          totalAmount: total, paidAmount: paid ? total : 0, balance: paid ? 0 : total,
          totalPacks: packs, totalQty: packs, status: paid ? "PAID" : "UNPAID", createdBy,
        });
        await (SaleLineModel as any).create({
          saleId: sale._id, source: "CHICKEN", bodegaProductId: c10._id,
          categoryName: catChicken.name, productName: c10.name,
          qty: packs, price, lineTotal: total, stockUnit: "PACK", packSize: C10_PACK, stockPcsOut: pcs,
        });
        await (BodegaProductModel as any).updateOne({ _id: c10._id }, { $inc: { stockQty: -pcs } });
        c10Stock -= pcs;
        totalSales += total;

        if (paid) {
          const payment = await (PaymentModel as any).create({
            customerId: customer._id, paymentDate: date, amount: total, appliedAmount: total, unappliedAmount: 0,
            remarks: `${TEST_PREFIX} Payment for ${receiptNumber}`, createdBy,
          });
          await (PaymentAllocationModel as any).create({ paymentId: payment._id, saleId: sale._id, amount: total });
          totalPayments += total;
        }
      } else {
        // Grocery sale (QTY)
        const gi = randInt(0, groceryProducts.length - 1);
        const product = groceryProducts[gi];
        const qty = randInt(2, 12);
        if (groceryStock[gi] < qty) continue;
        const price = Number(product.unitPrice);
        const total = price * qty;
        const paid = Math.random() < 0.7;

        const sale = await (SaleModel as any).create({
          receiptNumber, customerId: customer._id, saleDate: date, source: "BODEGA",
          totalAmount: total, paidAmount: paid ? total : 0, balance: paid ? 0 : total,
          totalQty: qty, status: paid ? "PAID" : "UNPAID", createdBy,
        });
        await (SaleLineModel as any).create({
          saleId: sale._id, source: "BODEGA", productId: product._id,
          categoryName: catGrocery.name, productName: product.name,
          qty, price, lineTotal: total, stockUnit: "QTY", packSize: 1, stockPcsOut: qty,
        });
        await (ProductModel as any).updateOne({ _id: product._id }, { $inc: { stockPcs: -qty } });
        groceryStock[gi] -= qty;
        totalSales += total;

        if (paid) {
          const payment = await (PaymentModel as any).create({
            customerId: customer._id, paymentDate: date, amount: total, appliedAmount: total, unappliedAmount: 0,
            remarks: `${TEST_PREFIX} Payment for ${receiptNumber}`, createdBy,
          });
          await (PaymentAllocationModel as any).create({ paymentId: payment._id, saleId: sale._id, amount: total });
          totalPayments += total;
        }
      }
    }

    // --- Expenses: 2-4 per day, mixed business ---
    const expensesToday = randInt(2, 4);
    for (let e = 0; e < expensesToday; e += 1) {
      const bodega = Math.random() < 0.5;
      const amount = randInt(2, 30) * 50;
      await (ExpenseModel as any).create({
        name: `${TEST_PREFIX} ${bodega ? "Bodega" : "Grocery"} expense`,
        expenseCategory: bodega ? "BODEGA" : "GROCERY",
        type: bodega ? pick(EXPENSE_TYPES_BODEGA, e) : pick(EXPENSE_TYPES_GROCERY, e),
        expenseDate: date, amount, createdBy,
      });
      totalExpenses += amount;
    }

    // --- Stock transfers: 1-2 per day to random outlets, mostly CONFIRMED ---
    const transfersToday = randInt(1, 2);
    for (let t = 0; t < transfersToday; t += 1) {
      const outlet = pick(outlets, randInt(0, outlets.length - 1));
      transferSeq += 1;
      const transferNumber = `TEST-TRF-${String(transferSeq).padStart(4, "0")}`;

      // Delivery: C10 packs (50 pcs/pack) + some raw OS1 heads to the outlet.
      const c10Packs = randInt(2, 8);
      const c10Pcs = c10Packs * C10_PACK;
      const osHeads = randInt(10, 40);
      if (c10Stock < c10Pcs || os1Stock < osHeads) continue;

      const confirmed = Math.random() < 0.8; // 80% confirmed, 20% left in transit
      const hasDisc = confirmed && Math.random() < 0.25; // some discrepancies
      const osReceived = hasDisc ? osHeads - randInt(1, 5) : osHeads;
      const osVariance = osHeads - osReceived;
      const totalQtyPcs = c10Pcs + osHeads;
      const receivedPcs = c10Pcs + osReceived;

      const transfer = await (StockTransferModel as any).create({
        transferNumber, outletId: outlet._id,
        status: confirmed ? "CONFIRMED" : "IN_TRANSIT",
        transferDate: date,
        totalItems: 2, totalQty: totalQtyPcs,
        totalReceivedQty: confirmed ? receivedPcs : 0,
        totalVarianceQty: confirmed ? osVariance : 0,
        hasDiscrepancy: hasDisc,
        remarks: `${TEST_PREFIX} Stock transfer`,
        outletRemarks: hasDisc ? `${TEST_PREFIX} Some OS1 heads short on arrival` : "",
        dispatchedAt: date, deliveredAt: confirmed ? date : undefined, confirmedAt: confirmed ? date : undefined,
        createdBy, dispatchedBy: createdBy, confirmedBy: confirmed ? createdBy : undefined,
      });

      await (StockTransferItemModel as any).create([
        {
          transferId: transfer._id, source: "BODEGA", bodegaProductId: c10._id,
          productName: c10.name, categoryName: catChicken.name, packSize: C10_PACK, unitLabel: "PACK",
          buyingPrice: 300, sellingPrice: 377, qty: c10Packs, qtyPcs: c10Pcs,
          receivedQty: confirmed ? c10Packs : 0, receivedPcs: confirmed ? c10Pcs : 0,
          varianceQty: 0, itemStatus: confirmed ? "ACCEPTED" : "PENDING",
        },
        {
          transferId: transfer._id, source: "BODEGA", bodegaProductId: os1._id,
          productName: os1.name, categoryName: catChicken.name, packSize: 0, unitLabel: "PCS",
          buyingPrice: 150, sellingPrice: 0, qty: osHeads, qtyPcs: osHeads,
          receivedQty: confirmed ? osReceived : 0, receivedPcs: confirmed ? osReceived : 0,
          varianceQty: confirmed ? osVariance : 0,
          itemStatus: confirmed ? (osVariance > 0 ? "PARTIAL" : "ACCEPTED") : "PENDING",
          remarks: hasDisc ? `${TEST_PREFIX} ${osVariance} heads short` : "",
        },
      ]);

      // Dispatch always deducts main-branch stock
      await (BodegaProductModel as any).updateOne({ _id: c10._id }, { $inc: { stockQty: -c10Pcs } });
      await (BodegaProductModel as any).updateOne({ _id: os1._id }, { $inc: { stockQty: -osHeads } });
      c10Stock -= c10Pcs;
      os1Stock -= osHeads;
      await (BodegaStockTransactionModel as any).create([
        { bodegaProductId: c10._id, type: "STOCK_OUT", quantity: c10Pcs, previousStock: 0, newStock: 0, remarks: `${TEST_PREFIX} STOCK TRANSFER ${transferNumber}`, referenceType: "STOCK_TRANSFER", referenceId: transfer._id, createdBy },
        { bodegaProductId: os1._id, type: "STOCK_OUT", quantity: osHeads, previousStock: 0, newStock: 0, remarks: `${TEST_PREFIX} STOCK TRANSFER ${transferNumber}`, referenceType: "STOCK_TRANSFER", referenceId: transfer._id, createdBy },
      ]);
      totalTransfers += 1;

      // If confirmed, increase outlet inventory + ledger for received pcs
      if (confirmed) {
        const items: Array<{ pid: any; name: string; cat: string; pack: number; buy: number; sell: number; recv: number }> = [
          { pid: c10._id, name: c10.name, cat: catChicken.name, pack: C10_PACK, buy: 300, sell: 377, recv: c10Pcs },
          { pid: os1._id, name: os1.name, cat: catChicken.name, pack: 0, buy: 150, sell: 0, recv: osReceived },
        ];
        for (const it of items) {
          if (it.recv <= 0) continue;
          const existing = await (OutletInventoryModel as any).findOneAndUpdate(
            { outletId: outlet._id, productSource: "BODEGA", productId: it.pid, isActive: true },
            { $inc: { stockQty: it.recv } },
            { new: true }
          );
          let invId = existing?._id;
          let prev = 0;
          let next = it.recv;
          if (existing) { next = Number(existing.stockQty || 0); prev = next - it.recv; }
          else {
            const created = await (OutletInventoryModel as any).create({
              outletId: outlet._id, productSource: "BODEGA", productId: it.pid, productName: it.name,
              categoryName: it.cat, stockQty: it.recv, unitLabel: "PCS", packSize: it.pack, lowStockAlert: 0,
              buyingPrice: it.buy, sellingPrice: it.sell, createdBy,
            });
            invId = created._id;
          }
          await (OutletStockTransactionModel as any).create({
            outletId: outlet._id, outletInventoryId: invId, productSource: "BODEGA", productId: it.pid,
            productName: it.name, transactionDate: date, type: "DELIVERY_RECEIVED", quantity: it.recv,
            previousStock: prev, newStock: next, referenceType: "STOCK_TRANSFER", referenceId: transfer._id,
            sourceChannel: "WEB", remarks: `${TEST_PREFIX} TRANSFER ${transferNumber}`, createdBy,
          });
        }
      }
    }
  }

  // One DRAFT transfer so you can test dispatch/cancel in the UI
  if (c10Stock >= 2 * C10_PACK) {
    const draft = await (StockTransferModel as any).create({
      transferNumber: `TEST-TRF-${String(transferSeq + 1).padStart(4, "0")}`,
      outletId: outlets[0]._id, status: "DRAFT", transferDate: new Date(),
      totalItems: 1, totalQty: 2 * C10_PACK, remarks: `${TEST_PREFIX} Draft transfer to test dispatch`, createdBy,
    });
    await (StockTransferItemModel as any).create({
      transferId: draft._id, source: "BODEGA", bodegaProductId: c10._id,
      productName: c10.name, categoryName: catChicken.name, packSize: C10_PACK, unitLabel: "PACK",
      buyingPrice: 300, sellingPrice: 377, qty: 2, qtyPcs: 2 * C10_PACK, receivedQty: 0, receivedPcs: 0,
      varianceQty: 0, itemStatus: "PENDING",
    });
  }

  console.log(`\nSeeded over ${DAYS} days:`);
  console.log(`  Sales receipts:     ${saleSeq}  (~₱${totalSales.toLocaleString()})`);
  console.log(`  Payments collected: ~₱${totalPayments.toLocaleString()}`);
  console.log(`  Expenses recorded:  ~₱${totalExpenses.toLocaleString()}`);
  console.log(`  Slicing batches:    ${slicingCount}`);
  console.log(`  Stock transfers:    ${totalTransfers} (+1 draft)`);
  console.log("\nAll records are marked with the [TEST] prefix.");
  console.log("Remove them anytime with: npm run cleanup:test");

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
