import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { EJSON } from "bson";
import mongoose from "mongoose";

const sourceName = "letsonDB-business-reset-2026-10-31T05-39-13-613Z.ejson";
const root = path.resolve(process.cwd(), ".local-backups");
const encode = (value: unknown) => EJSON.stringify(value, { relaxed: false });
const hash = (value: unknown) => createHash("sha256").update(encode(value)).digest("hex");
type Snapshot = Record<string, mongoose.mongo.Document[]>;

async function main() {
  const backup = EJSON.parse(await readFile(path.join(root, sourceName), "utf8"), { relaxed: false });
  if (backup.database !== "letsonDB" || !backup.collections || !Array.isArray(backup.clearedCollections)) throw new Error("Invalid backup.");
  const restored = backup.collections as Snapshot;
  // These transaction collections were added after this older backup was made.
  for (const name of ["outletemployeepurchases", "outletemployeecashmovements", "outletremittances"]) restored[name] ??= [];
  const names = Object.keys(restored);
  if (names.some((name) => !/^[a-z]+$/.test(name) || !Array.isArray(restored[name]))) throw new Error("Invalid collection scope.");
  if (!process.env.MONGODB_URI) throw new Error("Database configuration missing.");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const db = mongoose.connection.db!;
    if (db.databaseName !== "letsonDB") throw new Error("Database target mismatch.");
    const current: Snapshot = {};
    for (const name of names) current[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
    console.log(JSON.stringify({ database: db.databaseName, source: sourceName, collections: Object.fromEntries(names.map((name) => [name, { current: current[name].length, restore: restored[name].length }])) }, null, 2));
    if (!process.argv.includes("--confirm")) { console.log("Preview only; no data changed."); return; }
    const hello = await db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== "isdbgrid") throw new Error("Transactions required; nothing changed.");
    const recoveryPath = path.join(root, `letsonDB-pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.ejson`);
    await writeFile(recoveryPath, encode({ database: db.databaseName, createdAt: new Date(), collections: current }), { flag: "wx", mode: 0o600 });
    const verified = EJSON.parse(await readFile(recoveryPath, "utf8"), { relaxed: false });
    if (hash(verified.collections) !== hash(current)) throw new Error("Recovery backup verification failed.");
    console.log(`Verified recovery backup: ${recoveryPath}`);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const name of names) {
          const live = await db.collection(name).find({}, { session }).sort({ _id: 1 }).toArray();
          if (hash(live) !== hash(current[name])) throw new Error("Data changed during restore preparation; retry with entry screens idle.");
        }
        for (const name of names) {
          await db.collection(name).deleteMany({}, { session });
          if (restored[name].length) await db.collection(name).insertMany(restored[name], { session });
          const actual = await db.collection(name).find({}, { session }).sort({ _id: 1 }).toArray();
          const expected = [...restored[name]].sort((a, b) => String(a._id).localeCompare(String(b._id)));
          if (hash(actual) !== hash(expected)) throw new Error(`Restored data verification failed: ${name}`);
        }
        await db.collection("auditlogs").insertOne({ module: "SYSTEM", action: "RESTORE_BACKUP", entityType: "DATABASE", sourceChannel: "SYSTEM", remarks: "Owner-approved restore of October 31 2026 1:39 PM Manila backup", newValue: { sourceName, recoveryPath }, createdAt: new Date(), updatedAt: new Date() }, { session });
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    } finally { await session.endSession(); }
    console.log(`RESTORE VERIFIED: ${names.length} collections, ${Object.values(restored).reduce((sum, rows) => sum + rows.length, 0)} records. Other setup and audit history preserved.`);
  } finally { await mongoose.disconnect(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/g, "[redacted]") : "Restore failed"); process.exitCode = 1; });
