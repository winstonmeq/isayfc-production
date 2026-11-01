// app/api/stock-transfers/[id]/dispatch/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import {
  StockTransferError,
  dispatchTransferInTransaction,
} from "@/lib/stock-transfers";

export const dynamic = "force-dynamic";

async function handlePOST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission(
    "stock-transfers.manage"
  );
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid transfer ID." },
      { status: 400 }
    );
  }

  let mongoSession: mongoose.ClientSession | undefined;
  try {
    await dbConnect();
    mongoSession = await mongoose.startSession();
    const transactionSession = mongoSession;
    let transferNumber = "";

    await mongoSession.withTransaction(async () => {
      const transfer = await dispatchTransferInTransaction({
        transferId: id,
        userId: session?.user?.id,
        mongoSession: transactionSession,
      });

      transferNumber = transfer.transferNumber;
    });

    return NextResponse.json({
      success: true,
      message: `Transfer ${transferNumber} dispatched. Bodega stock has been deducted.`,
    });
  } catch (error) {
    if (error instanceof StockTransferError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error(error);

    return NextResponse.json(
      { success: false, message: "Unable to dispatch stock transfer." },
      { status: 500 }
    );
  } finally {
    await mongoSession?.endSession();
  }
}

export const POST = withAuditLog(handlePOST, {
  module: "STOCK_TRANSFERS",
  action: "DISPATCH",
  entityType: "STOCK_TRANSFER",
});
