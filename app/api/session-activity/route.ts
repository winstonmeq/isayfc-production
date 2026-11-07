import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
import { authOptions } from "@/lib/auth";
import { getUserAccess } from "@/lib/require-permission";
import LoginHistory from "@/models/LoginHistory";
import { recordSystemError } from "@/lib/system-error";

export async function POST(req: Request) {
  // Browser-only same-origin heartbeat; no client-supplied user or session IDs.
  if (req.headers.get("sec-fetch-site") !== "same-origin") return new NextResponse(null, { status: 403 });
  try {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id, id = session?.user?.loginHistoryId;
  if (!userId || !id || !isValidObjectId(id)) return new NextResponse(null, { status: 204 });
  const access = await getUserAccess(userId);
  if (!access?.isActive) return new NextResponse(null, { status: 401 });
  const now = new Date();
  await LoginHistory.updateOne({ _id: id, userId, status: "SUCCESS", logoutAt: null, lastActivityAt: { $lt: new Date(now.getTime() - 60000) } }, { $set: { lastActivityAt: now, expiresAt: new Date(now.getTime() + 30 * 86400000) } });
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    const reference = await recordSystemError({ source: "SESSION_ACTIVITY_API", path: "/api/session-activity" });
    return NextResponse.json({ success: false, reference, message: "Activity tracking is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
