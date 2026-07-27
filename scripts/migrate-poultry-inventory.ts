import { EJSON } from "bson";
import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function key(value: unknown) {
  return String(value || "");
}

function add(
  map: Map<string, { bags: number; kilos: number; heads: number }>,
  productId: unknown,
  values: { bags?: unknown; kilos?: unknown; heads?: unknown }
) {
  const id = key(productId);
  const current = map.get(id) || { bags: 0, kilos: 0, heads: 0 };
  current.bags += Number(values.bags || 0);
  current.kilos += Number(values.kilos || 0);
  current.heads += Number(values.heads || 0);
  map.set(id, current);
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Run with --confirm to migrate poultry inventory.");
  }
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing.");

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db || db.databaseName !== "letsonDB") {
    throw new Error("This migration is restricted to letsonDB.");
  }

  const [products, transactions, standards] = await Promise.all([
    db.collection("bodegaproducts").find({}).toArray(),
    db.collection("bodegastocktransactions").find({}).toArray(),
    db.collection("standardpackings").find({ isActive: true }).toArray(),
  ]);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = "C:\\tmp\\letson-database-backups";
  const backupPath = path.join(backupDir, `poultry-migration-${stamp}.ejson`);
  await mkdir(backupDir, { recursive: true });
  await writeFile(
    backupPath,
    EJSON.stringify({ products, transactions }, { relaxed: false }),
    "utf8"
  );
  console.log(`Backup created: ${backupPath}`);

  const wholeIds = new Set(standards.map((standard) => key(standard.wholeChickenId)));
  const activeDeliveries = await db
    .collection("deliveries")
    .find({ isVoided: { $ne: true } })
    .project({ _id: 1 })
    .toArray();
  const deliveryIds = activeDeliveries.map((delivery) => delivery._id);
  const deliveryItems = await db
    .collection("deliveryitems")
    .find({ deliveryId: { $in: deliveryIds } })
    .toArray();

  const nonVoidedBatches = await db
    .collection("slicingbatches")
    .find({ isVoided: { $ne: true } })
    .project({ _id: 1 })
    .toArray();
  const batchIds = nonVoidedBatches.map((batch) => batch._id);
  const slicingItems = await db
    .collection("slicingitems")
    .find({ batchId: { $in: batchIds } })
    .toArray();

  const delivered = new Map<string, { bags: number; kilos: number; heads: number }>();
  for (const item of deliveryItems) {
    add(delivered, item.productId || item.bodegaProductId, {
      bags: item.bags,
      kilos: item.kilos,
      heads: item.pieces,
    });
  }

  const consumed = new Map<string, { bags: number; kilos: number; heads: number }>();
  for (const item of slicingItems) {
    add(consumed, item.mainProductId, {
      bags: item.bags,
      kilos: item.kilos,
      heads: item.heads,
    });
  }

  for (const product of products) {
    const productId = key(product._id);
    if (!wholeIds.has(productId)) {
      await db.collection("bodegaproducts").updateOne(
        { _id: product._id },
        { $set: { stockBags: 0, stockKilos: 0, stockHeads: 0 } }
      );
      continue;
    }

    const stockIn = delivered.get(productId) || { bags: 0, kilos: 0, heads: 0 };
    const stockOut = consumed.get(productId) || { bags: 0, kilos: 0, heads: 0 };
    await db.collection("bodegaproducts").updateOne(
      { _id: product._id },
      {
        $set: {
          stockBags: Math.max(0, stockIn.bags - stockOut.bags),
          stockKilos: Math.max(0, stockIn.kilos - stockOut.kilos),
          stockHeads: Math.max(0, Number(product.stockQty || 0)),
        },
      }
    );
  }

  // Backfill existing delivery ledger dimensions. Reversal pairs receive the
  // same dimensions and are subsequently removed together by report logic.
  for (const item of deliveryItems) {
    await db.collection("bodegastocktransactions").updateMany(
      {
        referenceId: item.deliveryId,
        bodegaProductId: item.productId || item.bodegaProductId,
      },
      {
        $set: {
          bags: Number(item.bags || 0),
          kilos: Number(item.kilos || 0),
          heads: Number(item.pieces || 0),
          pieces: Number(item.pieces || 0),
        },
      }
    );
  }

  for (const item of slicingItems) {
    await db.collection("bodegastocktransactions").updateMany(
      { referenceId: item.batchId, bodegaProductId: item.mainProductId },
      {
        $set: {
          bags: Number(item.bags || 0),
          kilos: Number(item.kilos || 0),
          heads: Number(item.heads || 0),
          pieces: 0,
        },
      }
    );
    await db.collection("bodegastocktransactions").updateMany(
      { referenceId: item.batchId, bodegaProductId: item.slicedProductId },
      {
        $set: {
          bags: 0,
          kilos: 0,
          heads: 0,
          pieces: Number(item.actualSlicedPcs || 0),
        },
      }
    );
  }

  console.log(`Migrated ${products.length} products and ${transactions.length} ledger entries.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
