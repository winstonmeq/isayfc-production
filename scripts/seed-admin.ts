import dotenv from "dotenv";
import path from "node:path";
import bcrypt from "bcryptjs";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required in .env.");
  }

  if (!process.env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is required in .env. Do not use a hard-coded default password."
    );
  }

  const { default: dbConnect } = await import("../lib/mongodb");
  const { default: UserModel } = await import("../models/User");
  const { default: RoleModel } = await import("../models/Role");
  const { ROLE_PERMISSION_KEYS, ROLE_PRESETS } = await import("../lib/role-permissions");

  await dbConnect();

  const username = (process.env.SEED_ADMIN_USERNAME || "admin").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "ADMIN";
  const email = process.env.SEED_ADMIN_EMAIL || `${username}@letson.local`;
  const contact = process.env.SEED_ADMIN_CONTACT || "";

  console.log("Seeding system roles...");

  const adminRole = await RoleModel.findOneAndUpdate(
    { name: "ADMIN" },
    {
      $set: {
        name: "ADMIN",
        description: "System administrator with full access.",
        permissions: ROLE_PERMISSION_KEYS,
        isSystem: true,
        isActive: true,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  await RoleModel.findOneAndUpdate(
    { name: "CASHIER" },
    {
      $setOnInsert: {
        name: "CASHIER",
        description: "Outlet cashier; assigned outlet only. Main-system access is separate.",
        permissions: [...ROLE_PRESETS[0].permissions],
        isSystem: false,
        isActive: true,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  await RoleModel.findOneAndUpdate(
    { name: "INVENTORY STAFF" },
    {
      $setOnInsert: {
        name: "INVENTORY STAFF",
        description: "Inventory staff role for stock and product operations.",
        permissions: [
          "dashboard.view",
          "products.view",
          "products.manage",
          "bodega-products.view",
          "bodega-products.manage",
          "purchase-items.view",
          "purchase-items.manage",
          "supplier-deliveries.view",
          "supplier-deliveries.manage",
          "inventory.view",
          "inventory.manage",
        ],
        isSystem: false,
        isActive: true,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  await RoleModel.findOneAndUpdate(
    { name: "MANAGER" },
    {
      $setOnInsert: {
        name: "MANAGER",
        description: "Manager role for reports, sales, inventory, and payments.",
        permissions: [
          "dashboard.view",
          "customers.view",
          "customers.manage",
          "suppliers.view",
          "suppliers.manage",
          "products.view",
          "products.manage",
          "bodega-products.view",
          "bodega-products.manage",
          "purchase-items.view",
          "purchase-items.manage",
          "supplier-deliveries.view",
          "supplier-deliveries.manage",
          "slicing.view",
          "sales.view",
          "sales.manage",
          "sales-lines.view",
          "payments.view",
          "payments.manage",
          "inventory.view",
          "inventory.manage",
          "reports.sales",
          "reports.inventory",
          "reports.payments",
          "reports.customer-balance",
          "reports.product-movement",
          "reports.profit",
        ],
        isSystem: false,
        isActive: true,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  console.log("System roles seeded.");

  const hashedPassword = await bcrypt.hash(password, 12);
  const existingUser = await UserModel.findOne({ username });

  if (existingUser) {
    existingUser.name = name.toUpperCase();
    existingUser.username = username;
    existingUser.email = email.toLowerCase();
    existingUser.role = "ADMIN";
    existingUser.roleId = adminRole._id;
    existingUser.isActive = true;

    // Optional legacy fields if your User model still has them somewhere.
    (existingUser as any).contact = contact;
    (existingUser as any).position = "Admin";

    if (process.env.SEED_ADMIN_RESET_PASSWORD === "true") {
      existingUser.password = hashedPassword;
      console.log("Admin password reset because SEED_ADMIN_RESET_PASSWORD=true.");
    }

    await existingUser.save();
    console.log(`Admin user already exists and was updated: ${username}`);
    console.log("Role assigned: ADMIN");
    return;
  }

  await UserModel.create({
    name: name.toUpperCase(),
    username,
    email: email.toLowerCase(),
    password: hashedPassword,
    role: "ADMIN",
    roleId: adminRole._id,
    isActive: true,
  });

  console.log("Admin user created successfully.");
  console.log(`Username: ${username}`);
  console.log("Role assigned: ADMIN");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
