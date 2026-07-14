// scripts/close-open-shifts.ts
//
// Lists (and optionally closes) OPEN cash shifts. Useful to clear an orphaned
// shift left over from testing so the cashier can open a fresh one.
//
// USAGE:
//   List open shifts (for a cashier, or all):
//     CHECK_USERNAME=cashier1 npx tsx scripts/close-open-shifts.ts
//     npx tsx scripts/close-open-shifts.ts            # all open shifts
//
//   Actually close them (add --close):
//     CHECK_USERNAME=cashier1 npx tsx scripts/close-open-shifts.ts --close

import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required in .env.");

  const doClose = process.argv.includes("--close");
  const username = String(process.env.CHECK_USERNAME || "").trim().toLowerCase();

  const { default: dbConnect } = await import("../lib/mongodb");
  const { default: CashShiftModel } = await import("../models/CashShift");
  const { default: UserModel } = await import("../models/User");

  await dbConnect();

  // Narrow to one cashier if a username was given.
  let cashierId: string | undefined;
  if (username) {
    const u = await UserModel.findOne({ username }).select("_id name").lean<any>();
    if (!u) {
      console.log(`No user found with username "${username}".`);
      process.exit(0);
    }
    cashierId = u._id.toString();
    console.log(`Filtering to cashier "${username}" (${u.name}).`);
  }

  const filter: any = { status: "OPEN" };
  if (cashierId) filter.cashierId = cashierId;

  const open = await CashShiftModel.find(filter).lean<any[]>();

  if (open.length === 0) {
    console.log("No OPEN shifts found.");
    process.exit(0);
  }

  console.log(`\nFound ${open.length} OPEN shift(s):`);
  for (const s of open) {
    console.log(
      `  - ${s._id}  cashier=${s.cashierName}  float=${s.openingFloat}  openedAt=${
        s.openedAt ? new Date(s.openedAt).toISOString() : "?"
      }`
    );
  }

  if (!doClose) {
    console.log("\n(Run again with --close to close these shifts.)");
    process.exit(0);
  }

  const res = await CashShiftModel.updateMany(filter, {
    $set: {
      status: "CLOSED",
      closedAt: new Date(),
      closeRemarks: "Closed by admin script (orphaned shift cleanup).",
    },
  });
  console.log(`\nClosed ${res.modifiedCount} shift(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
