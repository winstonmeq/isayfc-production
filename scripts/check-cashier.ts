// scripts/check-cashier.ts
//
// Diagnostic: prints a user's role + permissions so we can see why a mobile
// action is denied. Read-only; changes nothing.
//
// USAGE:  CHECK_USERNAME=cashier1 npx tsx scripts/check-cashier.ts

import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required in .env.");

  const username = String(process.env.CHECK_USERNAME || "").trim().toLowerCase();
  if (!username) throw new Error("Set CHECK_USERNAME=<the cashier username>.");

  const { default: dbConnect } = await import("../lib/mongodb");
  const { default: UserModel } = await import("../models/User");
  await import("../models/Role");
  await import("../models/Outlet");

  await dbConnect();

  const user = await UserModel.findOne({ username })
    .populate("roleId", "name permissions isActive")
    .populate("outletId", "name code isActive status")
    .lean<any>();

  if (!user) {
    console.log(`No user found with username "${username}".`);
    process.exit(0);
  }

  console.log("\n=== USER ===");
  console.log("name:       ", user.name);
  console.log("username:   ", user.username);
  console.log("role (str): ", user.role);
  console.log("isActive:   ", user.isActive);
  console.log("outlet:     ", user.outletId
    ? `${user.outletId.name} (${user.outletId.code})`
    : "(none assigned)");

  console.log("\n=== ROLE (roleId) ===");
  if (!user.roleId) {
    console.log("(no roleId linked — permissions come from nowhere; all checks fail)");
  } else {
    console.log("role name:  ", user.roleId.name);
    console.log("role active:", user.roleId.isActive);
    const perms: string[] = user.roleId.permissions || [];
    console.log("permissions:", perms.length, "->", perms.join(", ") || "(none)");
    console.log("\nMobile-relevant checks:");
    for (const p of [
      "cash.manage",
      "sales.view",
      "sales.manage",
      "outlet-inventory.view",
      "outlet-inventory.manage",
      "outlet-repack.manage",
      "stock-transfers.confirm",
    ]) {
      console.log(`  ${perms.includes(p) ? "✅" : "❌"}  ${p}`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
