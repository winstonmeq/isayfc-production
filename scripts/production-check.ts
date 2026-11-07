import { loadEnvConfig } from "@next/env";
import { MongoClient } from "mongodb";
import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { productionEnvironmentIssues } from "../lib/production-environment";

async function main() {
  loadEnvConfig(process.cwd(), false);
  const issues = productionEnvironmentIssues(process.env);
  const uploads = process.env.UPLOADS_DIR;
  if (uploads && path.isAbsolute(uploads)) {
    const relative = path.relative(process.cwd(), uploads);
    if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
      issues.push("UPLOADS_DIR is inside the release folder; use persistent storage outside it.");
    }
    try {
      if (!(await stat(uploads)).isDirectory()) throw new Error();
      await access(uploads, constants.R_OK | constants.W_OK);
      console.log("PASS: upload directory exists and is readable/writable.");
    } catch { issues.push("Create UPLOADS_DIR and grant the application account read/write access."); }
  }
  if (process.env.MONGODB_URI) {
    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    try {
      await client.connect();
      const db = client.db();
      if (/test/i.test(db.databaseName) || ["admin", "local", "config"].includes(db.databaseName)) {
        issues.push("Configured database name appears to be a test/system database; verify the production URI.");
      }
      await db.command({ ping: 1 });
      const hello = await db.admin().command({ hello: 1 });
      if (!hello.setName && hello.msg !== "isdbgrid") issues.push("MongoDB must be a replica set or sharded cluster for transactions.");
      else console.log("PASS: MongoDB connection and transaction-capable topology.");
      if (!(await db.collection("users").findOne({ isActive: true }, { projection: { _id: 1 } }))) {
        issues.push("No active user exists; complete authorized user setup before launch.");
      }
    } catch (error) {
      const detail = error as { code?: string | number };
      issues.push(`MongoDB readiness check failed (code ${detail.code ?? "unavailable"}). Check connection and database permissions.`);
    } finally { await client.close(); }
  }
  for (const issue of issues) console.error(`BLOCKER: ${issue}`);
  console.log("Read-only check: no database or upload records were changed.");
  if (issues.length) process.exitCode = 1;
  else console.log("Production configuration checks passed. Business workflow, backups and deployment still require validation.");
}

main().catch(() => { console.error("Production check could not complete. No credentials are printed."); process.exitCode = 1; });
