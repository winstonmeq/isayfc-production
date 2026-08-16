// app/api/stock-transfers/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanString, escapeRegex, getPagination } from "@/lib/crud-utils";
import {
  StockTransferError,
  dispatchTransferInTransaction,
  generateTransferNumber,
  isDuplicateKeyError,
  prepareTransferItems,
  serializeTransfer,
  transferFail,
} from "@/lib/stock-transfers";
import OutletModel from "@/models/Outlet";
import StockTransferModel from "@/models/StockTransfer";
import StockTransferItemModel from "@/models/StockTransferItem";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUSES = ["DRAFT", "IN_TRANSIT", "DELIVERED", "CONFIRMED", "CANCELLED"];

export async function GET(req: NextRequest) {
  const { response } = await requirePermission([
    "stock-transfers.view",
    "stock-transfers.manage",
    "stock-transfers.confirm",
  ]);
  if (response) return response;

  await dbConnect();

  // Register Outlet model for populate.
  void OutletModel;

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);

  const status = cleanString(searchParams.get("status")).toUpperCase();
  const outletId = cleanString(searchParams.get("outletId"));
  const search = cleanString(searchParams.get("search"));
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));
  const discrepancyOnly = cleanString(searchParams.get("discrepancyOnly")) === "true";
  const incomingOnly = cleanString(searchParams.get("incoming")) === "true";

  const filter: Record<string, unknown> = {};

  if (incomingOnly) {
    // The outlet-facing view: transfers awaiting receipt or confirmation.
    filter.status = { $in: ["IN_TRANSIT", "DELIVERED"] };
  } else if (status && status !== "ALL" && STATUSES.includes(status)) {
    filter.status = status;
  }

  if (outletId && outletId !== "ALL" && isValidObjectId(outletId)) {
    filter.outletId = outletId;
  }

  if (search) {
    filter.transferNumber = new RegExp(escapeRegex(search), "i");
  }

  if (discrepancyOnly) {
    filter.hasDiscrepancy = true;
  }

  const dateFilter: Record<string, Date> = {};
  if (dateFrom) dateFilter.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
  if (dateTo) dateFilter.$lte = new Date(`${dateTo}T23:59:59.999Z`);
  if (Object.keys(dateFilter).length > 0) filter.transferDate = dateFilter;

  const [transfers, total, outlets] = await Promise.all([
    StockTransferModel.find(filter)
      .populate("outletId", "name code")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StockTransferModel.countDocuments(filter),
    OutletModel.find({ isActive: true, status: "ACTIVE" })
      .select("name code")
      .sort({ name: 1 })
      .lean(),
  ]);

  return NextResponse.json(
    {
      success: true,
      data: transfers.map((transfer) =>
        serializeTransfer(transfer as Parameters<typeof serializeTransfer>[0])
      ),
      outlets: outlets.map((outlet) => ({
        _id: outlet._id.toString(),
        name: outlet.name || "",
        code: outlet.code || "",
      })),
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

async function handlePOST(req: NextRequest) {
  const { response, session } = await requirePermission(
    "stock-transfers.manage"
  );
  if (response) return response;

  await dbConnect();

  let body: {
    outletId?: string;
    remarks?: string;
    transferDate?: string;
    dispatch?: boolean;
    items?: {
      source?: string;
      bodegaProductId?: string;
      productId?: string;
      standardPackingId?: string;
      qty?: number;
    }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body." },
      { status: 400 }
    );
  }

  try {
    const outletId = cleanString(body?.outletId);
    const remarks = cleanString(body?.remarks);
    const transferDateInput = cleanString(body?.transferDate);
    const dispatchNow = body?.dispatch === true;

    if (!isValidObjectId(outletId)) {
      transferFail(400, "Please select a valid outlet.");
    }

    const outlet = await OutletModel.findOne({
      _id: outletId,
      isActive: true,
      status: "ACTIVE",
    }).lean();

    if (!outlet) {
      transferFail(404, "Outlet not found or inactive.");
    }

    const preparedItems = await prepareTransferItems(body?.items || []);

    // Track totalQty in base units (pcs) so it matches the stock that moves.
    const totalQty = preparedItems.reduce((sum, item) => sum + item.baseQty, 0);

    let transfer = null;

    // Retry once if two users grab the same transfer number simultaneously.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        transfer = await StockTransferModel.create({
          transferNumber: await generateTransferNumber(),
          outletId,
          status: "DRAFT",
          transferDate: transferDateInput
            ? new Date(transferDateInput)
            : new Date(),
          totalItems: preparedItems.length,
          totalQty,
          remarks,
          createdBy: session?.user?.id,
        });
        break;
      } catch (error) {
        if (isDuplicateKeyError(error) && attempt === 0) continue;
        throw error;
      }
    }

    if (!transfer) {
      transferFail(500, "Unable to generate transfer number. Please try again.");
    }

    await StockTransferItemModel.insertMany(
      preparedItems.map((item) => ({ ...item, transferId: transfer._id }))
    );

    if (dispatchNow) {
      const mongoSession = await mongoose.startSession();

      try {
        await mongoSession.withTransaction(async () => {
          await dispatchTransferInTransaction({
            transferId: transfer._id.toString(),
            userId: session?.user?.id,
            mongoSession,
          });
        });
      } catch (error) {
        // The draft itself was created successfully — only dispatch failed
        // (e.g. insufficient stock). Tell the user the draft is safe.
        if (error instanceof StockTransferError) {
          return NextResponse.json(
            {
              success: false,
              message: `${transfer.transferNumber} was saved as a draft, but dispatch failed: ${error.message}`,
              data: { _id: transfer._id.toString() },
            },
            { status: error.status }
          );
        }

        throw error;
      } finally {
        await mongoSession.endSession();
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: dispatchNow
          ? `Transfer ${transfer.transferNumber} created and dispatched.`
          : `Transfer ${transfer.transferNumber} saved as draft.`,
        data: { _id: transfer._id.toString(), transferNumber: transfer.transferNumber },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof StockTransferError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error(error);

    return NextResponse.json(
      { success: false, message: "Unable to create stock transfer." },
      { status: 500 }
    );
  }
}

export const POST = withAuditLog(handlePOST, {
  module: "STOCK_TRANSFERS",
  action: "CREATE",
  entityType: "STOCK_TRANSFER",
});
