// One-time, idempotent migration that ensures every active outlet has one
// linked active sales customer.
//
// Usage:
//   npm run sync:outlet-customers

import dotenv from "dotenv";
import path from "node:path";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error(
      "Refusing to sync without --confirm. Usage: npm run sync:outlet-customers"
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured.");

  await mongoose.connect(uri);
  const { default: OutletModel } = await import("../models/Outlet");
  const { default: CustomerModel } = await import("../models/Customer");

  const outlets = await OutletModel.find({
    isActive: true,
    status: "ACTIVE",
  })
    .sort({ name: 1 })
    .lean();

  let linked = 0;
  let created = 0;
  let unchanged = 0;

  for (const outlet of outlets) {
    const alreadyLinked = await CustomerModel.exists({
      outletId: outlet._id,
      isActive: true,
    });
    if (alreadyLinked) {
      unchanged += 1;
      continue;
    }

    const existingCustomer = await CustomerModel.findOne({
      isActive: true,
      outletId: { $exists: false },
      $or: [{ name: outlet.name }, { name: outlet.code }],
    });

    if (existingCustomer) {
      existingCustomer.outletId = outlet._id;
      existingCustomer.type = "SALE";
      if (!existingCustomer.address) {
        existingCustomer.address = outlet.address || "";
      }
      if (!existingCustomer.phone) {
        existingCustomer.phone = outlet.contactNumber || "";
      }
      await existingCustomer.save();
      linked += 1;
      continue;
    }

    await CustomerModel.create({
      name: outlet.name,
      address: outlet.address || "",
      phone: outlet.contactNumber || "",
      type: "SALE",
      outletId: outlet._id,
    });
    created += 1;
  }

  console.log(`Database: ${mongoose.connection.db?.databaseName || "unknown"}`);
  console.log(`Active outlets: ${outlets.length}`);
  console.log(`Existing customers linked: ${linked}`);
  console.log(`New outlet customers created: ${created}`);
  console.log(`Already linked: ${unchanged}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
