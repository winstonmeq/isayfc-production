import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { EJSON } from "bson";
import mongoose from "mongoose";

const EXPECTED_DATABASE = "letsonDB";
// Explicit scope: leave master data and audit history intact; retain indexes.
const CLEAR_COLLECTIONS = [
  "deliveryitems", "deliveries", "salelines", "sales", "paymentallocations", "payments",
  "outletstocktransactions",
  "stocktransferitems", "stocktransfers", "slicingitems", "slicingbatches",
  "inventoryadjustments", "stockcounts", "bodegastocktransactions", "inventorytransactions",
  "supplierpayments", "supplierinvoices", "cashshifts", "expenses",
  "customerdeliveryitems", "customerdeliveries", "customerinventorytransactions", "customerinventories",
  "purchaseitems", "purchasebatches",
  "outletemployeepurchases", "outletemployeecashmovements",
  "outletremittances",
] as const;
const STOCK_FIELDS: Record<string, string[]> = {
  products: ["stockPcs", "stockBags", "stockKilos"],
  bodegaproducts: ["stockQty", "stockBags", "stockKilos", "stockHeads"],
  outletinventories: ["stockQty"],
};
const PRESERVED = ["users", "roles", "outlets", "categories", "customers", "suppliers", "expensetypes", "standardpackings", "slicingstandards", "discounts", "outletmenuitems", "menucatalogitems", "outletemployees", "correctionrecords"];
const stringify = (value: unknown) => EJSON.stringify(value, { relaxed: false });
const fingerprint = (value: unknown) => createHash("sha256").update(stringify(value)).digest("hex");

async function main() {
  const confirmed = process.argv.includes("--confirm");
  const databaseArgument = process.argv.find((arg) => arg.startsWith("--database="))?.slice("--database=".length);
  if (confirmed && databaseArgument !== EXPECTED_DATABASE) throw new Error(`Pass --database=${EXPECTED_DATABASE} explicitly to apply this reset.`);
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured.");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const db = mongoose.connection.db!;
    if (db.databaseName !== EXPECTED_DATABASE) throw new Error("Database does not match the approved reset target.");
    const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
    const targets = CLEAR_COLLECTIONS.filter((name) => names.has(name));
    const stockCollections = Object.keys(STOCK_FIELDS).filter((name) => names.has(name));
    const snapshot: Record<string, mongoose.mongo.Document[]> = {};
    for (const name of [...targets, ...stockCollections]) {
      snapshot[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
    }
    const preservedCounts: Record<string, number> = {};
    for (const name of PRESERVED.filter((name) => names.has(name))) preservedCounts[name] = await db.collection(name).countDocuments({});
    const counts = Object.fromEntries(targets.map((name) => [name, snapshot[name].length]));
    console.log(JSON.stringify({ database: db.databaseName, clear: counts, zeroStock: Object.fromEntries(stockCollections.map((name) => [name, snapshot[name].length])), preserved: preservedCounts }, null, 2));
    if (!confirmed) { console.log("Preview only. No data changed."); return; }

    const hello = await db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== "isdbgrid") throw new Error("Reset requires transaction support; no data changed.");
    const backupRoot = path.resolve(process.cwd(), ".local-backups");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupRoot, `${EXPECTED_DATABASE}-business-reset-${stamp}.ejson`);
    const relative = path.relative(path.resolve(process.cwd()), backupPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Backup path must remain in the workspace.");
    await mkdir(backupRoot, { recursive: true });
    const backup = { database: EXPECTED_DATABASE, createdAt: new Date(), clearedCollections: targets, stockFields: STOCK_FIELDS, collections: snapshot, preservedCounts };
    await writeFile(backupPath, stringify(backup), { encoding: "utf8", flag: "wx", mode: 0o600 });
    const verified = EJSON.parse(await readFile(backupPath, "utf8"), { relaxed: false }) as typeof backup;
    for (const name of Object.keys(snapshot)) {
      if (fingerprint(verified.collections[name]) !== fingerprint(snapshot[name])) throw new Error("Backup verification failed; no data changed.");
    }
    console.log(`Verified recovery backup: ${backupPath}`);

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const name of [...targets, ...stockCollections]) {
          const current = await db.collection(name).find({}, { session }).sort({ _id: 1 }).toArray();
          if (fingerprint(current) !== fingerprint(snapshot[name])) throw new Error("Records changed since backup. Reset aborted; run it again while entry screens are idle.");
        }
        for (const name of targets) {
          const result = await db.collection(name).deleteMany({}, { session });
          if (result.deletedCount !== snapshot[name].length) throw new Error(`Unexpected record count for ${name}; aborting reset.`);
        }
        for (const name of stockCollections) {
          await db.collection(name).updateMany({}, { $set: Object.fromEntries(STOCK_FIELDS[name].map((field) => [field, 0])) }, { session });
        }
        await db.collection("auditlogs").insertOne({
          module: "SYSTEM", action: "RESET_TEST_DATA", entityType: "DATABASE", sourceChannel: "SYSTEM",
          remarks: "OWNER-APPROVED FRESH BUSINESS TEST RESET; MASTER DATA PRESERVED",
          newValue: { backupPath: relative, clearedCounts: counts }, createdAt: new Date(), updatedAt: new Date(),
        }, { session });
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    } finally { await session.endSession(); }

    for (const name of targets) {
      if (await db.collection(name).countDocuments({}) !== 0) throw new Error(`Post-reset verification failed for ${name}. Backup is available.`);
    }
    for (const name of stockCollections) {
      const current = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
      const expected = snapshot[name].map((row) => ({ ...row, ...Object.fromEntries(STOCK_FIELDS[name].map((field) => [field, 0])) }));
      // Compare values without relying on object-key ordering after MongoDB updates.
      for (const row of current) {
        const original = expected.find((item) => String(item._id) === String(row._id));
        if (!original || Object.keys(original).some((key) => stringify(original[key]) !== stringify(row[key]))) throw new Error(`Master-data verification failed for ${name}.`);
      }
      if (current.length !== expected.length) throw new Error(`Product count changed in ${name}.`);
    }
    for (const [name, count] of Object.entries(preservedCounts)) {
      if (await db.collection(name).countDocuments({}) !== count) throw new Error(`Preserved collection count changed: ${name}.`);
    }
    console.log("RESET COMPLETE: requested transactions cleared; all main stock quantities zero; master data preserved. Existing audit history retained.");
    console.log(`Recovery backup: ${backupPath}`);
  } finally { await mongoose.disconnect(); }
}

main().catch((error: unknown) => {
  const failure = error as { name?: string; code?: number; message?: string };
  // Our guard messages contain no credentials. Suppress raw database connection errors.
  console.error(failure.name === "Error" ? failure.message : `Reset failed (${failure.name || "Error"}, code ${failure.code || "unknown"}).`);
  process.exitCode = 1;
});
