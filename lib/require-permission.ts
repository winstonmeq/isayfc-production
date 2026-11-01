import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import RoleModel from "@/models/Role";
import UserModel, { type UserRole } from "@/models/User";
import { legacyRoleForSelection, normalizeRolePermissions, type RolePermission } from "@/lib/role-permissions";

type UserAccess = {
  isActive: boolean;
  role: UserRole;
  roleName: string;
  permissions: string[];
};

// Short-lived cache so every API request does not hit the database for
// the same user's permissions. 30 seconds keeps role edits near-instant
// while bounding the extra load.
const ACCESS_CACHE_TTL_MS = 30_000;
const accessCache = new Map<string, { access: UserAccess | null; expiresAt: number }>();

function readCache(userId: string) {
  const entry = accessCache.get(userId);

  if (!entry) return undefined;

  if (entry.expiresAt < Date.now()) {
    accessCache.delete(userId);
    return undefined;
  }

  return entry.access;
}

function writeCache(userId: string, access: UserAccess | null) {
  // Prevent unbounded growth in long-lived processes.
  if (accessCache.size > 5000) {
    accessCache.clear();
  }

  accessCache.set(userId, {
    access,
    expiresAt: Date.now() + ACCESS_CACHE_TTL_MS,
  });
}

/**
 * Loads the user's current role permissions from the database instead of
 * trusting the (potentially stale) JWT. This means role edits and user
 * deactivation take effect on API requests within the cache TTL, without
 * requiring the user to log out and back in.
 */
export async function getUserAccess(userId: string): Promise<UserAccess | null> {
  const cached = readCache(userId);
  if (cached !== undefined) return cached;

  await dbConnect();

  // Register Role model for populate("roleId").
  void RoleModel;

  const user = await UserModel.findById(userId)
    .select("role roleId isActive")
    .populate("roleId", "name permissions isActive")
    .lean<{
      role?: string;
      isActive?: boolean;
      roleId?: {
        name?: string;
        permissions?: string[];
        isActive?: boolean;
      } | null;
    }>();

  if (!user) {
    writeCache(userId, null);
    return null;
  }

  const role = user.roleId;
  const roleIsActive = role ? role.isActive !== false : true;

  const access: UserAccess = {
    isActive: Boolean(user.isActive) && roleIsActive,
    role: legacyRoleForSelection(String(role?.name || user.role || "USER")),
    roleName: roleIsActive ? String(role?.name || "") : "",
    permissions:
      roleIsActive && Array.isArray(role?.permissions) ? normalizeRolePermissions(role.permissions) : [],
  };

  writeCache(userId, access);
  return access;
}

/** Call after role/user updates so changes apply immediately. */
export function invalidateUserAccessCache(userId?: string) {
  if (userId) {
    accessCache.delete(userId);
    return;
  }

  accessCache.clear();
}

/**
 * Requires the current user to hold at least one of the given permissions.
 * Accepts a single permission or an "any of" array (used by shared lookup
 * endpoints that serve multiple pages).
 */
export async function requirePermission(
  permission: RolePermission | RolePermission[]
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      session: null,
      response: NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      ),
    };
  }

  const access = await getUserAccess(String(session.user.id));

  if (!access || !access.isActive) {
    return {
      session: null,
      response: NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      ),
    };
  }

  session.user.role = access.role;
  session.user.roleName = access.roleName;
  session.user.permissions = access.permissions;
  if (access.role === "ADMIN" || access.roleName === "ADMIN") {
    return { session, response: null };
  }

  const required = Array.isArray(permission) ? permission : [permission];
  const allowed = required.some((key) => access.permissions.includes(key));

  if (allowed) {
    return { session, response: null };
  }

  return {
    session,
    response: NextResponse.json(
      { success: false, message: "Forbidden. You do not have permission." },
      { status: 403 }
    ),
  };
}
