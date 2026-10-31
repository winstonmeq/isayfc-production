import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured.");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
    const supported = Boolean(hello.setName || hello.msg === "isdbgrid");
    console.log(JSON.stringify({
      transactionSupport: supported,
      topology: hello.setName ? "replicaSet" : hello.msg === "isdbgrid" ? "sharded" : "standalone",
    }));
    if (!supported) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(() => {
  console.error("Unable to check MongoDB transaction support. Verify database availability and MONGODB_URI.");
  process.exitCode = 1;
});
