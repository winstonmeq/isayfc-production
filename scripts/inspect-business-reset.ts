import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured.");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const db = mongoose.connection.db!;
    const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
      .map((item) => item.name).filter((name) => !name.startsWith("system.")).sort();
    console.log(`Configured database: ${db.databaseName}`);
    for (const name of collections) {
      console.log(`${name}: ${await db.collection(name).countDocuments({})}`);
    }
    for (const name of ["products", "bodegaproducts", "outletinventories"]) {
      if (!collections.includes(name)) continue;
      const fields = name === "products" ? ["stockPcs", "stockBags", "stockKilos"] : name === "bodegaproducts" ? ["stockQty", "stockBags", "stockKilos", "stockHeads"] : ["stockQty"];
      const nonzero = await db.collection(name).countDocuments({ $or: fields.map((field) => ({ [field]: { $exists: true, $ne: 0 } })) });
      console.log(`${name} with nonzero stock: ${nonzero}`);
    }
  } finally { await mongoose.disconnect(); }
}
main().catch(() => { console.error("Unable to inspect the configured database."); process.exitCode = 1; });
