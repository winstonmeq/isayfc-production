import { loadEnvConfig } from "@next/env";
import { MongoClient } from "mongodb";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { assertBusinessTestDatabase, BUSINESS_TEST_DATABASE } from "../lib/business-test-policy";

const masters = [
  "users", "roles", "outlets", "categories", "customers", "suppliers",
  "expensetypes", "standardpackings", "slicingstandards", "discounts",
  "outletmenuitems", "menucatalogitems", "outletemployees", "productunits",
  "products", "bodegaproducts",
];

async function main() {
  // Match Next's file precedence and variable expansion, including escaped passwords.
  loadEnvConfig(process.cwd(), true);
  const mode = process.argv[2];
  if (mode !== "setup" && mode !== "start") throw new Error("Use setup or start.");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing.");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const source = client.db();
    assertBusinessTestDatabase(BUSINESS_TEST_DATABASE, source.databaseName);
    const target = client.db(BUSINESS_TEST_DATABASE);
    if (mode === "setup") {
      const existing = await target.listCollections({}, { nameOnly: true }).toArray();
      if (existing.length) throw new Error("Test database already exists. Nothing was overwritten. Use npm run dev:business-test.");
      for (const name of masters) {
        const documents = await source.collection(name).find({}).toArray();
        if (name === "products" || name === "bodegaproducts") {
          for (const document of documents) {
            for (const key of ["stockPcs", "stockQty", "stockBags", "stockKilos", "stockHeads"]) {
              if (key in document) document[key] = 0;
            }
          }
        }
        if (documents.length) await target.collection(name).insertMany(documents);
        console.log(`${name}: ${documents.length} master records copied`);
      }
      console.log("Separate test database prepared. No live records were changed; no transactions were copied.");
      return;
    }
    if (!(await target.collection("users").findOne({}))) {
      throw new Error("Run npm run test:setup first.");
    }
  } finally {
    await client.close();
  }
  console.log("TEST ENVIRONMENT: http://127.0.0.1:3100 — database: letson_business_test");
  const child = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3100"], {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      BUSINESS_TEST_MODE: "1",
      MONGODB_DB_NAME: BUSINESS_TEST_DATABASE,
      NEXTAUTH_URL: "http://127.0.0.1:3100",
      NEXTAUTH_SECRET: randomBytes(48).toString("hex"),
      UPLOADS_DIR: ".business-test/uploads",
    },
  });
  child.on("error", () => { console.error("Could not start test server."); process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
  process.on("SIGINT", () => child.kill());
  process.on("SIGTERM", () => child.kill());
}

main().catch((error: unknown) => {
  // Do not expose connection strings or credentials in database errors.
  const detail = error as { name?: string; code?: string | number };
  if (error instanceof Error && /not allowed to do action|not authorized|unauthorized/i.test(error.message)) {
    console.error("MongoDB permission denied: grant the configured database user readWrite on letson_business_test in Atlas > Database Access. Keep existing live database permissions unchanged, then rerun npm run test:setup. No live records were changed.");
    process.exitCode = 1;
    return;
  }
  const safeMessages = ["Use setup or start.", "MONGODB_URI is missing.", "Run npm run test:setup first.", "Test database already exists. Nothing was overwritten. Use npm run dev:business-test.", "Business testing requires the dedicated letson_business_test database."];
  console.error(error instanceof Error && safeMessages.includes(error.message)
    ? error.message
    : `Test database connection/setup failed (${detail.name ?? "Error"}, code ${detail.code ?? "unavailable"}). Check database access permissions.`);
  process.exitCode = 1;
});
