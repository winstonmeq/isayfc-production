import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { invalidateUserAccessCache, requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanString } from "@/lib/crud-utils";
import { normalizeRolePermissions } from "@/lib/role-permissions";
import RoleModel from "@/models/Role";
import { isRoleDuplicateKey, roleNameConflictMessage } from "@/lib/role-name-conflict";

function serializeRole(role: any) {
  return {
    _id: role._id.toString(),
    name: role.name,
    description: role.description || "",
    permissions: normalizeRolePermissions(role.permissions || []),
    permissionCount: normalizeRolePermissions(role.permissions || []).length,
    isSystem: Boolean(role.isSystem),
    isActive: Boolean(role.isActive),
    createdAt: role.createdAt ? new Date(role.createdAt).toISOString() : undefined,
    updatedAt: role.updatedAt ? new Date(role.updatedAt).toISOString() : undefined,
  };
}

function cleanPermissions(input: unknown) {
  if (!Array.isArray(input)) return [];

  return normalizeRolePermissions(input.map((item) => cleanString(item)));
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("roles.view");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid role ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const role = await RoleModel.findOne({ _id: id, isActive: true }).lean();

  if (!role) {
    return NextResponse.json(
      { success: false, message: "Role not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: serializeRole(role) });
}

async function handlePATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("roles.manage");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid role ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const role = await RoleModel.findOne({ _id: id, isActive: true });

  if (!role) {
    return NextResponse.json(
      { success: false, message: "Role not found." },
      { status: 404 }
    );
  }

  if (role.isSystem) {
    return NextResponse.json(
      { success: false, message: "System role cannot be edited." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const name = cleanString(body.name).toUpperCase();
  const description = cleanString(body.description);
  const permissions = cleanPermissions(body.permissions);

  if (!name) {
    return NextResponse.json(
      { success: false, message: "Role name is required." },
      { status: 400 }
    );
  }

  const duplicate = await RoleModel.findOne({
    _id: { $ne: id },
    name,
  });

  if (duplicate) {
    return NextResponse.json(
      { success: false, message: roleNameConflictMessage(duplicate.isActive === false) },
      { status: 409 }
    );
  }

  role.name = name;
  role.description = description;
  role.permissions = permissions;
  try {
    await role.save();
  } catch (error) {
    if (isRoleDuplicateKey(error)) return NextResponse.json({ success: false, message: roleNameConflictMessage() }, { status: 409 });
    throw error;
  }

  // Role permissions changed: drop cached access so it applies immediately.
  invalidateUserAccessCache();

  return NextResponse.json({
    success: true,
    message: "Role updated successfully.",
    data: serializeRole(role.toObject()),
  });
}

async function handleDELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("roles.manage");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid role ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const role = await RoleModel.findOne({ _id: id, isActive: true });

  if (!role) {
    return NextResponse.json(
      { success: false, message: "Role not found." },
      { status: 404 }
    );
  }

  if (role.isSystem) {
    return NextResponse.json(
      { success: false, message: "System role cannot be disabled." },
      { status: 403 }
    );
  }

  role.isActive = false;
  await role.save();

  // Role permissions changed: drop cached access so it applies immediately.
  invalidateUserAccessCache();

  return NextResponse.json({
    success: true,
    message: "Role disabled successfully.",
  });
}

export const PATCH = withAuditLog(handlePATCH, {
  module: "ROLES",
  action: "UPDATE",
  entityType: "ROLE",
});

export const DELETE = withAuditLog(handleDELETE, {
  module: "ROLES",
  action: "DELETE",
  entityType: "ROLE",
});
