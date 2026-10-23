import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId, type QueryFilter } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import {
  cleanNumber,
  cleanString,
  escapeRegex,
  getPagination,
} from "@/lib/crud-utils";
import { correctionReason, recordCorrection } from "@/lib/corrections";
import { manilaDateString } from "@/lib/date-utils";
import { saveUpload } from "@/lib/upload-storage";
import CustomerModel from "@/models/Customer";
import PaymentModel from "@/models/Payment";
import PaymentAllocationModel from "@/models/PaymentAllocation";
import SaleModel from "@/models/Sale";

export const runtime = "nodejs";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function serializePayment(payment: any) {
  return {
    _id: payment._id.toString(),
    customerId: payment.customerId?._id?.toString?.() || payment.customerId?.toString?.(),
    customerName: payment.customerId?.name || "",
    paymentDate: payment.paymentDate
      ? new Date(payment.paymentDate).toISOString()
      : undefined,
    amount: payment.amount || 0,
    appliedAmount: payment.appliedAmount || 0,
    unappliedAmount: payment.unappliedAmount || 0,
    referenceNumber: payment.referenceNumber || "",
    receiptImageUrl: payment.receiptImageUrl || "",
    remarks: payment.remarks || "",
    createdByName: payment.createdBy?.name || payment.createdBy?.username || "",
  };
}

function getSafeReceiptExtension(file: File) {
  const allowedTypes: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };

  const extension = allowedTypes[file.type];

  if (!extension) {
    throw new Error("Receipt image must be JPG, JPEG, PNG, GIF, or WEBP.");
  }

  return extension;
}

async function saveReceiptImage(file: File) {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Receipt image must not exceed 5MB.");
  }

  const extension = getSafeReceiptExtension(file);
  return saveUpload(
    "payments",
    new Uint8Array(await file.arrayBuffer()),
    extension
  );
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("payments.view");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const customerId = cleanString(searchParams.get("customerId"));
  const search = cleanString(searchParams.get("search"));
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));

  const filter: QueryFilter<any> = {
    isVoided: false,
  };

  if (customerId && customerId !== "ALL" && isValidObjectId(customerId)) {
    filter.customerId = customerId;
  }

  if (dateFrom || dateTo) {
    filter.paymentDate = {};

    if (dateFrom) {
      filter.paymentDate.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }

    if (dateTo) {
      filter.paymentDate.$lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
  }

  if (search) {
    const customers = await CustomerModel.find({
      isActive: true,
      name: {
        $regex: escapeRegex(search),
        $options: "i",
      },
    })
      .select("_id")
      .lean();

    filter.customerId = {
      $in: customers.map((item) => item._id),
    };
  }

  const [items, total] = await Promise.all([
    PaymentModel.find(filter)
      .populate("customerId", "name")
      .populate("createdBy", "name username")
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PaymentModel.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map(serializePayment),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

async function handlePOST(req: NextRequest) {
  const { response, session: authSession } = await requirePermission("payments.manage");
  if (response) return response;

  await dbConnect();

  const formData = await req.formData();
  const customerId = cleanString(String(formData.get("customerId") || ""));
  const paymentDate = cleanString(String(formData.get("paymentDate") || ""));
  const amount = cleanNumber(String(formData.get("amount") || "0"));
  const referenceNumber = cleanString(String(formData.get("referenceNumber") || ""));
  const remarks = cleanString(String(formData.get("remarks") || ""));
  const lateEntryReason = correctionReason(formData.get("correctionReason"));
  const isLateEntry = Boolean(paymentDate && paymentDate < manilaDateString());

  if (!customerId || !isValidObjectId(customerId)) {
    return NextResponse.json(
      { success: false, message: "Valid customer is required." },
      { status: 400 }
    );
  }

  if (!paymentDate) {
    return NextResponse.json(
      { success: false, message: "Payment date is required." },
      { status: 400 }
    );
  }

  if (isLateEntry && lateEntryReason.length < 5) {
    return NextResponse.json(
      { success: false, message: "A reason of at least 5 characters is required for a backdated payment." },
      { status: 400 }
    );
  }

  if (amount <= 0) {
    return NextResponse.json(
      { success: false, message: "Payment amount must be greater than zero." },
      { status: 400 }
    );
  }

  const customer = await CustomerModel.findOne({ _id: customerId, isActive: true });

  if (!customer) {
    return NextResponse.json(
      { success: false, message: "Customer not found." },
      { status: 404 }
    );
  }

  let receiptImageUrl = "";
  const receiptImage = formData.get("receiptImage");

  if (receiptImage instanceof File && receiptImage.size > 0) {
    try {
      receiptImageUrl = await saveReceiptImage(receiptImage);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          message: error instanceof Error ? error.message : "Invalid receipt image.",
        },
        { status: 400 }
      );
    }
  }

  const mongoSession = await mongoose.startSession();

  try {
    let paymentId: any;

    await mongoSession.withTransaction(async () => {
      const [payment] = await PaymentModel.create(
        [
          {
            customerId,
            paymentDate: new Date(paymentDate),
            amount,
            appliedAmount: 0,
            unappliedAmount: amount,
            referenceNumber,
            receiptImageUrl,
            remarks,
            createdBy: authSession?.user?.id,
          },
        ],
        { session: mongoSession }
      );

      paymentId = payment._id;

      let remainingAmount = amount;
      let appliedAmount = 0;

      const unpaidSales = await SaleModel.find({
        customerId,
        isVoided: false,
        fulfillmentStatus: { $ne: "PENDING" },
        balance: { $gt: 0 },
      })
        .sort({ saleDate: 1, createdAt: 1 })
        .session(mongoSession);

      const allocations = [];

      for (const sale of unpaidSales) {
        if (remainingAmount <= 0) break;

        const saleBalance = Number(sale.balance || 0);
        const amountToApply = Math.min(remainingAmount, saleBalance);

        sale.paidAmount = Number(sale.paidAmount || 0) + amountToApply;
        sale.balance = Math.max(Number(sale.totalAmount || 0) - sale.paidAmount, 0);

        if (sale.balance <= 0) {
          sale.status = "PAID";
        } else if (sale.paidAmount > 0) {
          sale.status = "PARTIAL";
        } else {
          sale.status = "UNPAID";
        }

        await sale.save({ session: mongoSession });

        allocations.push({
          paymentId: payment._id,
          saleId: sale._id,
          amount: amountToApply,
        });

        remainingAmount -= amountToApply;
        appliedAmount += amountToApply;
      }

      if (allocations.length > 0) {
        await PaymentAllocationModel.insertMany(allocations, {
          session: mongoSession,
        });
      }

      payment.appliedAmount = appliedAmount;
      payment.unappliedAmount = Math.max(remainingAmount, 0);
      await payment.save({ session: mongoSession });

      if (isLateEntry) {
        await recordCorrection({
          entityType: "PAYMENT",
          entityId: payment._id,
          referenceNumber,
          correctionType: "LATE_ENTRY",
          reason: lateEntryReason,
          transactionDate: payment.paymentDate,
          correctedBy: authSession?.user?.id,
          metadata: { postedAt: new Date().toISOString() },
          session: mongoSession,
        });
      }
    });

    const populated = await PaymentModel.findById(paymentId)
      .populate("customerId", "name")
      .populate("createdBy", "name username")
      .lean();

    return NextResponse.json(
      {
        success: true,
        message: "Payment saved successfully.",
        data: serializePayment(populated),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error(error);
    return NextResponse.json(
      { success: false, message: "Unable to save payment." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}

export const POST = withAuditLog(handlePOST, {
  module: "PAYMENTS",
  action: "CREATE",
  entityType: "PAYMENT",
});
