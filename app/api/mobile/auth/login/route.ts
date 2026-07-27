// app/api/mobile/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import dbConnect from "@/lib/mongodb";
import {
  getClientIp,
  loginRateLimiter,
  loginRateLimitKey,
} from "@/lib/login-rate-limit";
import { loadMobileUser, signMobileToken } from "@/lib/mobile-auth";
import RoleModel from "@/models/Role";
import UserModel from "@/models/User";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await dbConnect();
  void RoleModel;

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body." },
      { status: 400 }
    );
  }

  const identifier = String(body?.username || "").trim().toLowerCase();
  const password = String(body?.password || "");

  if (!identifier || !password) {
    return NextResponse.json(
      { success: false, message: "Username and password are required." },
      { status: 400 }
    );
  }

  const accountKey = loginRateLimitKey(identifier);
  const clientKey = loginRateLimitKey(identifier, getClientIp(req));
  const accountLimit = loginRateLimiter.check(accountKey);
  const clientLimit = loginRateLimiter.check(clientKey);
  const blocked = !accountLimit.allowed ? accountLimit : clientLimit;

  if (!blocked.allowed) {
    return NextResponse.json(
      {
        success: false,
        message: "Too many login attempts. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(blocked.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const user = await UserModel.findOne({
    isActive: true,
    $or: [{ username: identifier }, { email: identifier }],
  })
    .select("_id password")
    .lean<{ _id: { toString: () => string }; password?: string }>();

  // Generic message so we don't reveal which part was wrong.
  const invalid = NextResponse.json(
    { success: false, message: "Invalid username or password." },
    { status: 401 }
  );

  if (!user) {
    loginRateLimiter.recordFailure(accountKey);
    loginRateLimiter.recordFailure(clientKey);
    return invalid;
  }

  const ok = await bcrypt.compare(password, String(user.password || ""));
  if (!ok) {
    loginRateLimiter.recordFailure(accountKey);
    loginRateLimiter.recordFailure(clientKey);
    return invalid;
  }

  const profile = await loadMobileUser(user._id.toString());
  if (!profile) return invalid;

  loginRateLimiter.clear(accountKey);
  loginRateLimiter.clear(clientKey);
  const token = signMobileToken(profile.id, profile.username);

  return NextResponse.json({
    success: true,
    token,
    user: profile,
  });
}
