// lib/mobile-auth.ts
//
// Token-based auth for the Flutter cashier app. Completely separate from the
// web app's NextAuth cookie session — the web app is untouched.
//
// Flow:
//   1. POST /api/mobile/auth/login verifies username+password and calls
//      signMobileToken() to return a Bearer token.
//   2. Every mobile endpoint calls requireMobileAuth(req, permission) which
//      reads the Authorization header, verifies the token, loads the user's
//      CURRENT permissions + outlet from the database, and checks access.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import RoleModel from "@/models/Role";
import OutletModel from "@/models/Outlet";
import UserModel from "@/models/User";
import type { RolePermission } from "@/lib/role-permissions";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not set; cannot sign mobile tokens.");
  }
  return secret;
}

export type MobileTokenPayload = {
  sub: string; // user id
  username: string;
  type: "mobile";
};

export function signMobileToken(userId: string, username: string) {
  return jwt.sign(
    { sub: userId, username, type: "mobile" } satisfies MobileTokenPayload,
    getSecret(),
    { expiresIn: TOKEN_TTL_SECONDS }
  );
}

export function verifyMobileToken(token: string): MobileTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (
      typeof decoded === "object" &&
      decoded &&
      (decoded as { type?: string }).type === "mobile" &&
      typeof (decoded as { sub?: string }).sub === "string"
    ) {
      return decoded as MobileTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export type MobileUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  roleName: string;
  permissions: string[];
  outlet: { id: string; name: string; code: string } | null;
  outletInactive: boolean;
};

function unauthorized(message = "Unauthorized.") {
  return NextResponse.json({ success: false, message }, { status: 401 });
}

function forbidden(message = "You do not have permission.") {
  return NextResponse.json({ success: false, message }, { status: 403 });
}

/** Loads the current user (with role + outlet) from a verified token's sub. */
export async function loadMobileUser(userId: string): Promise<MobileUser | null> {
  await dbConnect();
  void RoleModel;
  void OutletModel;

  const user = await UserModel.findById(userId)
    .select("name username email role isActive roleId outletId")
    .populate("roleId", "name permissions isActive")
    .populate("outletId", "name code isActive status")
    .lean<{
      _id: { toString: () => string };
      name?: string;
      username?: string;
      email?: string;
      role?: string;
      isActive?: boolean;
      roleId?: { name?: string; permissions?: string[]; isActive?: boolean } | null;
      outletId?: {
        _id: { toString: () => string };
        name?: string;
        code?: string;
        isActive?: boolean;
        status?: string;
      } | null;
    }>();

  if (!user || user.isActive === false) return null;

  const role = user.roleId;
  const roleActive = role ? role.isActive !== false : true;
  const assignedOutlet = user.outletId;
  const outlet =
    assignedOutlet?.isActive !== false && assignedOutlet?.status === "ACTIVE"
      ? assignedOutlet
      : null;

  return {
    id: user._id.toString(),
    name: String(user.name || ""),
    username: String(user.username || ""),
    email: String(user.email || ""),
    role: String(user.role || ""),
    roleName: String(role?.name || ""),
    permissions:
      roleActive && Array.isArray(role?.permissions) ? role.permissions : [],
    outletInactive: Boolean(assignedOutlet && !outlet),
    outlet: outlet
      ? {
          id: outlet._id.toString(),
          name: String(outlet.name || ""),
          code: String(outlet.code || ""),
        }
      : null,
  };
}

export function getBearerToken(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

/**
 * Gate a mobile endpoint. Returns { user } on success, or { response } with the
 * correct 401/403 to return immediately. ADMIN role bypasses permission checks.
 */
export async function requireMobileAuth(
  req: NextRequest,
  permission?: RolePermission | RolePermission[]
): Promise<
  | { user: MobileUser; response: null }
  | { user: null; response: NextResponse }
> {
  const token = getBearerToken(req);
  if (!token) return { user: null, response: unauthorized() };

  const payload = verifyMobileToken(token);
  if (!payload || !isValidObjectId(payload.sub)) {
    return { user: null, response: unauthorized("Invalid or expired token.") };
  }

  const user = await loadMobileUser(payload.sub);
  if (!user) return { user: null, response: unauthorized() };

  if (!permission) return { user, response: null };

  const isAdmin = user.role === "ADMIN" || user.roleName === "ADMIN";
  if (isAdmin) return { user, response: null };

  const required = Array.isArray(permission) ? permission : [permission];
  const allowed = required.some((p) => user.permissions.includes(p));

  if (!allowed) return { user: null, response: forbidden() };

  return { user, response: null };
}
