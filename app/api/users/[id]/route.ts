import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { invalidateUserAccessCache, requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanString } from "@/lib/crud-utils";
import RoleModel from "@/models/Role";
import UserModel from "@/models/User";
import OutletModel from "@/models/Outlet";
import { legacyRoleForSelection, roleNeedsOutlet, normalizeRolePermissions } from "@/lib/role-permissions";

function serializeUser(user: any) {
  const role = user.roleId;
  const outlet = user.outletId;

  return {
    _id: user._id.toString(),
    name: user.name || "",
    username: user.username || "",
    email: user.email || "",
    role: user.role || "USER",
    roleId: role?._id?.toString?.() || user.roleId?.toString?.() || "",
    roleName: role?.name || "",
    outletId: outlet?._id?.toString?.() || user.outletId?.toString?.() || "",
    outletName: outlet?.name || "",
    permissions: normalizeRolePermissions(role?.permissions || []),
    permissionCount: Number(role?.permissions?.length || 0),
    isActive: Boolean(user.isActive),
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : undefined,
    updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : undefined,
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("users.view");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid user ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const user = await UserModel.findOne({ _id: id, isActive: true })
    .populate("roleId", "name permissions")
    .populate("outletId", "name code")
    .lean();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "User not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: serializeUser(user) });
}

async function handlePATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("users.manage");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid user ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const user = await UserModel.findOne({ _id: id, isActive: true });

  if (!user) {
    return NextResponse.json(
      { success: false, message: "User not found." },
      { status: 404 }
    );
  }

  const body = await req.json();
  const name = cleanString(body.name).toUpperCase();
  const email = cleanString(body.email).toLowerCase();
  const username = cleanString(body.username || user.username).toLowerCase();
  const password = cleanString(body.password);
  const roleId = cleanString(body.roleId);
  const outletId = cleanString(body.outletId);

  if (!name) {
    return NextResponse.json(
      { success: false, message: "User name is required." },
      { status: 400 }
    );
  }

  if (!email) {
    return NextResponse.json(
      { success: false, message: "Email is required." },
      { status: 400 }
    );
  }

  if (!username) {
    return NextResponse.json(
      { success: false, message: "Username is required." },
      { status: 400 }
    );
  }

  if (!roleId || !isValidObjectId(roleId)) {
    return NextResponse.json(
      { success: false, message: "Valid role is required." },
      { status: 400 }
    );
  }

  const roleRecord = await RoleModel.findOne({ _id: roleId, isActive: true });

  if (!roleRecord) {
    return NextResponse.json(
      { success: false, message: "Selected role was not found." },
      { status: 404 }
    );
  }

  if (roleNeedsOutlet(roleRecord.name, roleRecord.permissions) && !outletId) return NextResponse.json({ success: false, message: "Select the store assigned to this outlet cashier." }, { status: 400 });
  if (outletId && (!isValidObjectId(outletId) || !(await OutletModel.exists({ _id: outletId, isActive: true, status: "ACTIVE" })))) return NextResponse.json({ success: false, message: "Select an active outlet." }, { status: 400 });

  const duplicate = await UserModel.findOne({
    _id: { $ne: id },
    isActive: true,
    $or: [{ username }, { email }],
  });

  if (duplicate) {
    return NextResponse.json(
      { success: false, message: "Username or email already exists." },
      { status: 409 }
    );
  }

  user.name = name;
  user.username = username;
  user.email = email;
  user.role = legacyRoleForSelection(roleRecord.name);
  user.roleId = roleId as any;
  user.outletId = (outletId && isValidObjectId(outletId) ? outletId : undefined) as any;

  if (password) {
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    user.password = await bcrypt.hash(password, 12);
  }

  await user.save();

  // User role/status changed: drop cached access so it applies immediately.
  invalidateUserAccessCache(user._id.toString());

  const populatedUser = await UserModel.findById(user._id)
    .populate("roleId", "name permissions")
    .populate("outletId", "name code")
    .lean();

  return NextResponse.json({
    success: true,
    message: "User updated successfully.",
    data: serializeUser(populatedUser),
  });
}

async function handleDELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session: authSession } = await requirePermission("users.manage");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid user ID." },
      { status: 400 }
    );
  }

  if (authSession?.user?.id === id) {
    return NextResponse.json(
      { success: false, message: "You cannot disable your own account." },
      { status: 400 }
    );
  }

  await dbConnect();

  const user = await UserModel.findOne({ _id: id, isActive: true });

  if (!user) {
    return NextResponse.json(
      { success: false, message: "User not found." },
      { status: 404 }
    );
  }

  // Soft-delete with a targeted update, not user.save(): save() re-validates
  // the entire document, so a single legacy user with a missing field or a
  // lowercase `role` would make disabling them fail. We only need to flip
  // isActive — updateOne touches that field alone and skips full validation.
  await UserModel.updateOne({ _id: user._id }, { $set: { isActive: false } });

  // User role/status changed: drop cached access so it applies immediately.
  invalidateUserAccessCache(user._id.toString());

  return NextResponse.json({
    success: true,
    message: "User disabled successfully.",
  });
}

export const PATCH = withAuditLog(handlePATCH, {
  module: "USERS",
  action: "UPDATE",
  entityType: "USER",
});

export const DELETE = withAuditLog(handleDELETE, {
  module: "USERS",
  action: "DELETE",
  entityType: "USER",
});
