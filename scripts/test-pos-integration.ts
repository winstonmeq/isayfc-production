import "dotenv/config";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import mongoose from "mongoose";
import { encode } from "next-auth/jwt";
import UserModel from "../models/User";

let stage = "configuration";

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("Configure MONGODB_URI before running integration tests.");
  // A new database name prevents any fixture writes to the configured business database.
  const runId = randomBytes(6).toString("hex");
  const databaseName = `letson_pos_test_${runId}`;
  const testUri = new URL(process.env.MONGODB_URI);
  testUri.pathname = `/${databaseName}`;
  const uri = testUri.toString();
  const secret = randomBytes(32).toString("hex");
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolveClose) => listener.close(() => resolveClose()));
  const baseUrl = `http://127.0.0.1:${port}`;
  let server: ChildProcess | undefined;
  let adminId: mongoose.Types.ObjectId | undefined;
  try {
    stage = "isolated database connection";
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    stage = "transaction support";
    const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== "isdbgrid") throw new Error("Integration tests require MongoDB transaction support.");
    stage = "test administrator creation";
    const admin = await UserModel.create({ name: "TEST POS ADMIN", username: `test_pos_${runId}`, password: randomBytes(32).toString("hex"), role: "ADMIN" });
    adminId = admin._id;
    stage = "test authentication";
    const jwt = await encode({ secret, token: { id: String(admin._id), role: "ADMIN", name: "TEST POS ADMIN", username: admin.username, roleId: "", roleName: "ADMIN", permissions: [] }, maxAge: 3600 });
    const env = { ...process.env, MONGODB_URI: uri, NEXTAUTH_URL: baseUrl, NEXTAUTH_SECRET: secret,
      TEST_MONGODB_URI: uri, TEST_POS_BASE_URL: baseUrl, TEST_POS_ADMIN_COOKIE: `next-auth.session-token=${jwt}` };
    server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: ["ignore", "ignore", "inherit"], windowsHide: true });
    stage = "test server startup";
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error("Test server exited before becoming ready.");
      try {
        const response = await fetch(`${baseUrl}/api/auth/session`);
        if (response.ok) { ready = true; break; }
      } catch { /* Server is still starting. */ }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    if (!ready) throw new Error("Test server did not become ready.");
    console.log("Running real POS API tests in an isolated test database.");
    const runner = spawn(process.execPath, ["--import", "tsx", "--test", "tests/pos-business-flow.integration.test.ts"], { env, stdio: "inherit", windowsHide: true });
    const [code] = await once(runner, "exit");
    process.exitCode = Number(code || 0);
  } finally {
    if (server && server.exitCode === null) {
      server.kill();
      await once(server, "exit");
    }
    if (adminId && mongoose.connection.readyState === 1) await UserModel.deleteOne({ _id: adminId });
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  const failure = error as { name?: string; code?: number };
  console.error(`POS integration check failed during ${stage} (${failure.name || "Error"}, code ${failure.code || "unknown"}).`);
  process.exitCode = 1;
});
