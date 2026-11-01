import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanString, escapeRegex, getPagination } from "@/lib/crud-utils";
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

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("users.view");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const search = cleanString(searchParams.get("search"));

  const filter: Record<string, any> = {
    isActive: true,
  };

  if (search) {
    filter.$or = [
      { name: { $regex: escapeRegex(search), $options: "i" } },
      { username: { $regex: escapeRegex(search), $options: "i" } },
      { email: { $regex: escapeRegex(search), $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    UserModel.find(filter)
      .populate("roleId", "name permissions")
      .populate("outletId", "name code")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    UserModel.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map(serializeUser),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

async function handlePOST(req: NextRequest) {
  const { response } = await requirePermission("users.manage");
  if (response) return response;

  await dbConnect();

  const body = await req.json();
  const name = cleanString(body.name).toUpperCase();
  const email = cleanString(body.email).toLowerCase();
  const password = cleanString(body.password);
  const roleId = cleanString(body.roleId);
  const outletId = cleanString(body.outletId);
  const username = cleanString(body.username || body.email || body.name).toLowerCase();

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

  if (!password || password.length < 8) {
    return NextResponse.json(
      { success: false, message: "Password must be at least 8 characters." },
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

  const existing = await UserModel.findOne({
    isActive: true,
    $or: [{ username }, { email }],
  });

  if (existing) {
    return NextResponse.json(
      { success: false, message: "Username or email already exists." },
      { status: 409 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await UserModel.create({
    name,
    username,
    email,
    password: hashedPassword,
    role: legacyRoleForSelection(roleRecord.name),
    roleId,
    outletId: outletId && isValidObjectId(outletId) ? outletId : undefined,
  });

  const populatedUser = await UserModel.findById(user._id)
    .populate("roleId", "name permissions")
    .populate("outletId", "name code")
    .lean();

  return NextResponse.json(
    {
      success: true,
      message: "User created successfully.",
      data: serializeUser(populatedUser),
    },
    { status: 201 }
  );
}

export const POST = withAuditLog(handlePOST, {
  module: "USERS",
  action: "CREATE",
  entityType: "USER",
});
