import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserAccess } from "@/lib/require-permission";
import { LoginRateLimiter } from "@/lib/login-rate-limit";
import { recordSystemError } from "@/lib/system-error";
import { safeErrorPath, validErrorReference } from "@/lib/system-error-policy";

const limiter = new LoginRateLimiter(5, 60000, 60000);
export async function POST(req: Request) {
  if (req.headers.get("sec-fetch-site") !== "same-origin") return new NextResponse(null, { status: 403 });
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return new NextResponse(null, { status: 401 });
    const access = await getUserAccess(userId);
    if (!access?.isActive) return new NextResponse(null, { status: 401 });
    limiter.prune();
    if (!limiter.check(userId).allowed) return new NextResponse(null, { status: 429 });
    limiter.recordFailure(userId);
    const reader = req.body?.getReader();
    if (!reader) return new NextResponse(null, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 2048) { await reader.cancel(); return new NextResponse(null, { status: 413 }); } chunks.push(part.value); }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!validErrorReference(body?.reference) || !["PAGE", "ROOT"].includes(body?.source)) return new NextResponse(null, { status: 400 });
    await recordSystemError({ userId, reference: body.reference, source: body.source, path: safeErrorPath(body.path), digest: typeof body.digest === "string" ? body.digest : undefined });
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ success: false, message: "Error reporting is temporarily unavailable." }, { status: 503 }); }
}
