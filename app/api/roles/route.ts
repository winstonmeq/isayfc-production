import { NextRequest, NextResponse } from "next/server";
import type { QueryFilter } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanString, escapeRegex, getPagination } from "@/lib/crud-utils";
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

export async function GET(req: NextRequest) {
  const lookup = req.nextUrl.searchParams.get("lookup") === "true";
  const { response } = await requirePermission(lookup ? ["roles.view", "users.manage"] : ["roles.view", "roles.manage"]);
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const search = cleanString(searchParams.get("search"));

  const filter: QueryFilter<any> = {
    isActive: true,
  };

  if (search) {
    filter.name = {
      $regex: escapeRegex(search),
      $options: "i",
    };
  }

  const [items, total] = await Promise.all([
    RoleModel.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    RoleModel.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map(serializeRole),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

async function handlePOST(req: NextRequest) {
  const { response, session: authSession } = await requirePermission("roles.manage");
  if (response) return response;

  await dbConnect();

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

  const existing = await RoleModel.findOne({ name });

  if (existing) {
    return NextResponse.json(
      { success: false, message: roleNameConflictMessage(existing.isActive === false) },
      { status: 409 }
    );
  }

  let role;
  try {
    role = await RoleModel.create({
    name,
    description,
    permissions,
    createdBy: authSession?.user?.id,
  });
  } catch (error) {
    if (isRoleDuplicateKey(error)) return NextResponse.json({ success: false, message: roleNameConflictMessage() }, { status: 409 });
    throw error;
  }

  return NextResponse.json(
    {
      success: true,
      message: "Role created successfully.",
      data: serializeRole(role.toObject()),
    },
    { status: 201 }
  );
}

export const POST = withAuditLog(handlePOST, {
  module: "ROLES",
  action: "CREATE",
  entityType: "ROLE",
});
