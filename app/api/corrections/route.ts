import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { getPagination } from "@/lib/crud-utils";
import { requirePermission } from "@/lib/require-permission";
import CorrectionRecordModel from "@/models/CorrectionRecord";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { response } = await requirePermission([
    "corrections.view",
    "audit-logs.view",
  ]);
  if (response) return response;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const entityType = String(searchParams.get("entityType") || "").toUpperCase();

  const filter: Record<string, unknown> = {};
  if (["SALE", "PAYMENT", "DELIVERY"].includes(entityType)) {
    filter.entityType = entityType;
  }

  const [records, total] = await Promise.all([
    CorrectionRecordModel.find(filter)
      .populate("correctedBy", "name username")
      .populate("approvedBy", "name username")
      .sort({ correctedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CorrectionRecordModel.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: records.map((record: any) => ({
      id: record._id.toString(),
      entityType: record.entityType,
      entityId: record.entityId?.toString?.() || "",
      referenceNumber: record.referenceNumber || "",
      correctionType: record.correctionType,
      reason: record.reason,
      transactionDate: record.transactionDate?.toISOString?.(),
      correctedAt: record.correctedAt?.toISOString?.(),
      correctedBy:
        record.correctedBy?.name || record.correctedBy?.username || "",
      approvedBy:
        record.approvedBy?.name || record.approvedBy?.username || "",
      status: record.status,
      metadata: record.metadata || {},
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}
