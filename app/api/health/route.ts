import { NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();

  try {
    const mongoose = await dbConnect();
    if (!mongoose.connection.db) {
      throw new Error("Database connection is unavailable.");
    }
    await mongoose.connection.db.command({ ping: 1 });

    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        uptimeSeconds: Math.floor(process.uptime()),
        responseTimeMs: Date.now() - startedAt,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        database: "disconnected",
        responseTimeMs: Date.now() - startedAt,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
