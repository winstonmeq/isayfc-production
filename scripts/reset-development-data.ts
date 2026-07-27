import dotenv from "dotenv";
import { EJSON } from "bson";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const EXPECTED_DATABASE = "letsonDB";
const PRESERVED_COLLECTIONS = new Set([
  "users",
  "roles",
  "categories",
  "customers",
  "suppliers",
  "products",
  "bodegaproducts",
  "standardpackings",
]);

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error(
      "Refusing to reset without --confirm. Usage: npm run reset:test-data"
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured.");

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is unavailable.");
  if (db.databaseName !== EXPECTED_DATABASE) {
    throw new Error(
      `Refusing to reset database "${db.databaseName}". Expected "${EXPECTED_DATABASE}".`
    );
  }

  const collections = (await db.listCollections().toArray())
    .map((collection) => collection.name)
    .filter((name) => !name.startsWith("system."))
    .sort();

  // Back up every document before changing anything. Relaxed false preserves
  // BSON types such as ObjectId and Date for a future restore.
  const backup: Record<string, unknown[]> = {};
  for (const name of collections) {
    backup[name] = await db.collection(name).find({}).toArray();
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve("C:\\tmp", "letson-database-backups");
  const backupPath = path.join(backupDir, `${EXPECTED_DATABASE}-${stamp}.ejson`);
  await mkdir(backupDir, { recursive: true });
  await writeFile(backupPath, EJSON.stringify(backup, { relaxed: false }), "utf8");
  console.log(`Backup created: ${backupPath}`);

  const dropped: string[] = [];
  for (const name of collections) {
    if (PRESERVED_COLLECTIONS.has(name)) continue;
    await db.dropCollection(name);
    dropped.push(name);
  }

  const groceryStockReset = collections.includes("products")
    ? await db.collection("products").updateMany(
        {},
        {
          $set: {
            stockPcs: 0,
            stockBags: 0,
            stockKilos: 0,
          },
        }
      )
    : null;

  const bodegaStockReset = collections.includes("bodegaproducts")
    ? await db.collection("bodegaproducts").updateMany(
        {},
        {
          $set: {
            stockQty: 0,
            stockBags: 0,
            stockKilos: 0,
            stockHeads: 0,
          },
        }
      )
    : null;

  console.log("Dropped collections:");
  if (dropped.length === 0) {
    console.log("  None");
  } else {
    for (const name of dropped) {
      console.log(`  ${name}`);
    }
  }

  console.log("Preserved collections:");
  for (const name of [...PRESERVED_COLLECTIONS].sort()) {
    const exists = collections.includes(name);
    console.log(`  ${name}: ${exists ? "preserved" : "not found"}`);
  }

  console.log("Stock reset:");
  console.log(
    `  products: ${groceryStockReset?.matchedCount || 0} product(s) set to zero`
  );
  console.log(
    `  bodegaproducts: ${bodegaStockReset?.matchedCount || 0} product(s) set to zero`
  );

  await mongoose.disconnect();
  console.log("Test-data reset complete.");
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
