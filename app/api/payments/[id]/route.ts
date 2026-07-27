// app/api/payments/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import PaymentModel from "@/models/Payment";
import PaymentAllocationModel from "@/models/PaymentAllocation";
import SaleModel from "@/models/Sale";
import {
  correctionReason,
  recordCorrection,
} from "@/lib/corrections";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}

async function handleDELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission("payments.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid payment ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const body = await req.json().catch(() => ({}));
  const reason = correctionReason(body?.reason);
  if (reason.length < 5) {
    return NextResponse.json(
      { success: false, message: "A correction reason of at least 5 characters is required." },
      { status: 400 }
    );
  }

  const mongoSession = await mongoose.startSession();

  try {
    await mongoSession.withTransaction(async () => {
      // Atomically claim the payment so two simultaneous voids cannot both
      // reverse the same allocations.
      const payment = await PaymentModel.findOneAndUpdate(
        { _id: id, isVoided: false },
        { $set: { isVoided: true } },
        { new: true, session: mongoSession }
      );

      if (!payment) {
        fail(404, "Payment not found.");
      }

      const allocations = await PaymentAllocationModel.find({
        paymentId: payment._id,
      }).session(mongoSession);

      for (const allocation of allocations) {
        const sale = await SaleModel.findById(allocation.saleId).session(
          mongoSession
        );

        if (!sale || sale.isVoided) continue;

        sale.paidAmount = Math.max(
          Number(sale.paidAmount || 0) - Number(allocation.amount || 0),
          0
        );

        sale.balance = Math.max(
          Number(sale.totalAmount || 0) - sale.paidAmount,
          0
        );

        if (sale.balance <= 0) {
          sale.status = "PAID";
        } else if (sale.paidAmount > 0) {
          sale.status = "PARTIAL";
        } else {
          sale.status = "UNPAID";
        }

        await sale.save({ session: mongoSession });
      }

      await recordCorrection({
        entityType: "PAYMENT",
        entityId: payment._id,
        referenceNumber: payment.referenceNumber,
        correctionType: "VOID",
        reason,
        transactionDate: payment.paymentDate,
        correctedBy: session?.user?.id,
        metadata: {
          amount: Number(payment.amount || 0),
          reversedAllocations: allocations.length,
        },
        session: mongoSession,
      });
    });

    return NextResponse.json({
      success: true,
      message: "Payment voided successfully.",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error(error);

    return NextResponse.json(
      { success: false, message: "Unable to void payment." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}

export const DELETE = withAuditLog(handleDELETE, {
  module: "PAYMENTS",
  action: "VOID",
  entityType: "PAYMENT",
});
