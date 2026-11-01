// app/api/audit-logs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { cleanString, escapeRegex, getPagination } from "@/lib/crud-utils";
import AuditLogModel from "@/models/AuditLog";
import UserModel from "@/models/User";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function buildDateFilter(dateFrom: string, dateTo: string) {
  const filter: Record<string, Date> = {};

  if (dateFrom) {
    filter.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
  }

  if (dateTo) {
    filter.$lte = new Date(`${dateTo}T23:59:59.999Z`);
  }

  return Object.keys(filter).length > 0 ? filter : null;
}

type PopulatedAuditLog = {
  _id: { toString: () => string };
  module?: string;
  action?: string;
  entityType?: string;
  entityId?: { toString?: () => string } | null;
  remarks?: string;
  sourceChannel?: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt?: Date | string;
  createdBy?: {
    _id?: { toString?: () => string };
    name?: string;
    username?: string;
  } | null;
};

function serializeAuditLog(log: PopulatedAuditLog) {
  const user = log.createdBy;

  return {
    _id: log._id.toString(),
    module: log.module || "",
    action: log.action || "",
    entityType: log.entityType || "",
    entityId: log.entityId?.toString?.() || "",
    remarks: log.remarks || "",
    sourceChannel: log.sourceChannel || "WEB",
    oldValue: log.oldValue ?? null,
    newValue: log.newValue ?? null,
    userId: user?._id?.toString?.() || "",
    userName: user?.name || user?.username || "SYSTEM",
    createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : undefined,
  };
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission([
    "audit-logs.view",
  ]);
  if (response) return response;

  await dbConnect();

  // Register User model for populate("createdBy").
  void UserModel;

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);

  const module_ = cleanString(searchParams.get("module")).toUpperCase();
  const action = cleanString(searchParams.get("action")).toUpperCase();
  const userId = cleanString(searchParams.get("userId"));
  const search = cleanString(searchParams.get("search"));
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));

  const filter: Record<string, unknown> = {};

  if (module_ && module_ !== "ALL") {
    filter.module = module_;
  }

  if (action && action !== "ALL") {
    filter.action = action;
  }

  if (userId && userId !== "ALL" && isValidObjectId(userId)) {
    filter.createdBy = userId;
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    filter.$or = [
      { remarks: regex },
      { entityType: regex },
      { module: regex },
      { action: regex },
    ];
  }

  const dateFilter = buildDateFilter(dateFrom, dateTo);
  if (dateFilter) {
    filter.createdAt = dateFilter;
  }

  const [logs, total, modules, actions, userIds] = await Promise.all([
    AuditLogModel.find(filter)
      .populate("createdBy", "name username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLogModel.countDocuments(filter),
    AuditLogModel.distinct("module"),
    AuditLogModel.distinct("action"),
    AuditLogModel.distinct("createdBy"),
  ]);

  const validUserIds = (userIds as unknown[])
    .map((id) => String(id))
    .filter((id) => isValidObjectId(id));

  const users = await UserModel.find({ _id: { $in: validUserIds } })
    .select("name username")
    .sort({ name: 1 })
    .lean();

  return NextResponse.json(
    {
      success: true,
      data: (logs as unknown as PopulatedAuditLog[]).map(serializeAuditLog),
      filters: {
        modules: (modules as string[]).filter(Boolean).sort(),
        actions: (actions as string[]).filter(Boolean).sort(),
        users: users.map((user) => ({
          _id: user._id.toString(),
          name: user.name || user.username || "",
        })),
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}
