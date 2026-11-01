import "dotenv/config";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { EJSON } from "bson";
import mongoose from "mongoose";
import Sale from "../models/Sale";
import StockTransfer from "../models/StockTransfer";
import { postOutletDelivery } from "../lib/post-outlet-delivery";

// Converts accounting only. Never changes stock, sales quantities, or payments.
async function main() {
  const apply = process.argv.includes("--confirm");
  if (apply && !process.argv.includes("--database=letsonDB")) throw new Error("Explicit --database=letsonDB required.");
  if (!process.env.MONGODB_URI) throw new Error("Database connection not configured.");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const db = mongoose.connection.db!;
    if (db.databaseName !== "letsonDB") throw new Error("Unexpected database; no changes made.");
    const transfers = await StockTransfer.find({ status: { $in: ["DRAFT", "IN_TRANSIT", "DELIVERED", "CONFIRMED"] } }).sort({ _id: 1 }).lean();
    const sales = await Sale.find({ _id: { $in: transfers.flatMap((t) => t.saleId ? [t.saleId] : []) } }).lean();
    console.log(JSON.stringify({ database: db.databaseName, deliveryCount: transfers.length, confirmed: transfers.filter((t) => t.status === "CONFIRMED").length, legacyInternalSales: sales.filter((s) => s.transactionType === "INTERNAL_TRANSFER").length, apply }));
    const generated = await db.collection("expenses").find({ origin: "OWNER_OUTLET_DELIVERY", isActive: true }).toArray();
    console.log(JSON.stringify({ deliverySales: sales.map((sale) => ({ status: sale.status, recognized: sale.fulfillmentStatus, amount: sale.totalAmount, paid: sale.paidAmount, balance: sale.balance, regularCustomer: sale.transactionType === "EXTERNAL_SALE", ownerOutletTagged: !!sale.ownerOutletId })), automaticExpenses: generated.map((expense) => ({ category: expense.expenseCategory, amount: expense.amount, mainExpense: !expense.outletId })) }));
    if (!apply || !transfers.length) return;
    const collections: Record<string, unknown[]> = {};
    for (const name of ["sales", "salelines", "stocktransfers", "expenses", "expensetypes"]) collections[name] = await db.collection(name).find({}).toArray();
    const directory = path.resolve(process.cwd(), ".local-backups");
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `outlet-accounting-${new Date().toISOString().replace(/[:.]/g, "-")}.ejson`);
    const backup = EJSON.stringify({ database: db.databaseName, createdAt: new Date(), collections }, { relaxed: false });
    await writeFile(file, backup, { flag: "wx", mode: 0o600 });
    if (await readFile(file, "utf8") !== backup) throw new Error("Backup verification failed.");
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const snapshot of transfers) {
          const transfer = await StockTransfer.findById(snapshot._id).session(session).orFail();
          if (transfer.status !== snapshot.status || transfer.updatedAt.getTime() !== snapshot.updatedAt.getTime()) throw new Error("Delivery changed since preview; retry migration.");
          if (transfer.status === "CONFIRMED") await postOutletDelivery(String(transfer._id), session, undefined, true);
          else if (transfer.saleId) await Sale.updateOne({ _id: transfer.saleId, isVoided: false }, { $set: { transactionType: "EXTERNAL_SALE", ownerOutletId: transfer.outletId } }, { session });
        }
      });
    } finally { await session.endSession(); }
    console.log("Accounting updated. Stock and payment records unchanged. Backup verified.");
  } finally { await mongoose.disconnect(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Migration failed"); process.exitCode = 1; });
