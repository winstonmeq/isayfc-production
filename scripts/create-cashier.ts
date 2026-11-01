// scripts/create-cashier.ts
//
// Creates a ready-to-use CASHIER login for the mobile app:
//   1. Ensures a "CASHIER" role exists with the right mobile permissions.
//   2. Picks the outlet to assign (by code, or the first active outlet).
//   3. Creates the cashier user, assigned to that outlet.
//
// Driven by environment variables (no hard-coded passwords).
//
// USAGE (from the main-system project root):
//   CASHIER_USERNAME=cashier1 \
//   CASHIER_PASSWORD=YourStrongPass123 \
//   CASHIER_NAME="Juan Dela Cruz" \
//   CASHIER_OUTLET_CODE=TEST-TORIL \
//   npx tsx scripts/create-cashier.ts
//
// CASHIER_OUTLET_CODE is optional — if omitted, the first active outlet is used.
// Re-running with the same username updates that user's password/outlet/role.

import dotenv from "dotenv";
import path from "node:path";
import bcrypt from "bcryptjs";
import { ROLE_PRESETS } from "../lib/role-permissions";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const CASHIER_PERMISSIONS = [...ROLE_PRESETS[0].permissions];

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required in .env.");
  }

  const username = String(process.env.CASHIER_USERNAME || "").trim().toLowerCase();
  const password = String(process.env.CASHIER_PASSWORD || "");
  const name = String(process.env.CASHIER_NAME || username).trim().toUpperCase();
  const outletCode = String(process.env.CASHIER_OUTLET_CODE || "").trim();

  if (!username || !password) {
    throw new Error(
      "CASHIER_USERNAME and CASHIER_PASSWORD are required. See the comment at the top of this file."
    );
  }

  if (password.length < 8) {
    throw new Error("CASHIER_PASSWORD must be at least 8 characters.");
  }

  const { default: dbConnect } = await import("../lib/mongodb");
  const { default: UserModel } = await import("../models/User");
  const { default: RoleModel } = await import("../models/Role");
  const { default: OutletModel } = await import("../models/Outlet");

  await dbConnect();

  // 1) Ensure the CASHIER role exists with the mobile permissions.
  let role = await RoleModel.findOne({ name: "CASHIER" });
  if (!role) {
    role = await RoleModel.create({
      name: "CASHIER",
      description: "Mobile cashier (POS) access",
      permissions: CASHIER_PERMISSIONS,
      isActive: true,
    });
    console.log("Created CASHIER role.");
  } else {
    // Make sure it has all the permissions the mobile app needs.
    const merged = Array.from(
      new Set([...(role.permissions || []), ...CASHIER_PERMISSIONS])
    );
    role.permissions = merged;
    role.isActive = true;
    await role.save();
    console.log("Updated existing CASHIER role permissions.");
  }

  // 2) Pick the outlet.
  const outlet = outletCode
    ? await OutletModel.findOne({ code: outletCode })
    : await OutletModel.findOne({ isActive: true, status: "ACTIVE" }).sort({
        name: 1,
      });

  if (!outlet) {
    throw new Error(
      outletCode
        ? `No outlet found with code "${outletCode}". Create the outlet first, or omit CASHIER_OUTLET_CODE to use the first active outlet.`
        : "No active outlet found. Create an outlet first (web app → Outlets)."
    );
  }

  // 3) Create or update the cashier user.
  const hashedPassword = await bcrypt.hash(password, 12);
  const email = `${username}@letson.local`;

  const existing = await UserModel.findOne({ username });

  if (existing) {
    existing.name = name;
    existing.password = hashedPassword;
    existing.role = "CASHIER";
    existing.roleId = role._id;
    existing.outletId = outlet._id;
    existing.isActive = true;
    await existing.save();
    console.log(`Updated existing user "${username}".`);
  } else {
    await UserModel.create({
      name,
      username,
      email,
      password: hashedPassword,
      role: "CASHIER",
      roleId: role._id,
      outletId: outlet._id,
      isActive: true,
    });
    console.log(`Created cashier user "${username}".`);
  }

  console.log("\nCashier is ready. Log in on the mobile app with:");
  console.log(`  Username: ${username}`);
  console.log(`  Password: (the one you set)`);
  console.log(`  Outlet:   ${outlet.name} (${outlet.code})`);

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
