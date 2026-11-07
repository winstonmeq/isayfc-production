
import mongoose from "mongoose";
import { assertBusinessTestDatabase } from "./business-test-policy";

const MONGODB_URI = process.env.MONGODB_URI!;
const testDatabase = process.env.BUSINESS_TEST_MODE === "1"
  ? assertBusinessTestDatabase(process.env.MONGODB_DB_NAME)
  : undefined;

if (!MONGODB_URI) {
  throw new Error("Please define MONGODB_URI in .env");
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export default async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI!, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      ...(testDatabase ? { dbName: testDatabase } : {}),
    }).catch((error) => {
      // A temporary database outage must not poison every subsequent request.
      cached.promise = null;
      throw error;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export async function getMongoDb() {
  const mongooseInstance = await dbConnect();

  if (!mongooseInstance.connection.db) {
    throw new Error("MongoDB database connection is not ready.");
  }

  return mongooseInstance.connection.db;
}
