import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import SlicingBatchModel from "@/models/SlicingBatch";
import SlicingItemModel from "@/models/SlicingItem";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}

async function handleDELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission("slicing.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid slicing batch ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const mongoSession = await mongoose.startSession();

  try {
    await mongoSession.withTransaction(async () => {
      // Atomically claim the batch so two simultaneous voids cannot both run.
      const batch = await SlicingBatchModel.findOneAndUpdate(
        { _id: id, isVoided: false },
        { $set: { isVoided: true } },
        { new: true, session: mongoSession }
      );

      if (!batch) {
        const exists = await SlicingBatchModel.exists({ _id: id });
        fail(
          exists ? 400 : 404,
          exists ? "Slicing batch already voided." : "Slicing batch not found."
        );
      }

      const items = await SlicingItemModel.find({ batchId: batch._id }).session(
        mongoSession
      );

      const transactions: any[] = [];

      for (const item of items) {
        const heads = Number(item.heads || 0);
        const bags = Number(item.bags || 0);
        const kilos = Number(item.kilos || 0);
        const slicedPcs = Number(item.actualSlicedPcs || 0);

        // Restore whole chicken stock.
        if (heads > 0) {
          const mainProduct = await BodegaProductModel.findOneAndUpdate(
            { _id: item.mainProductId },
            {
              $inc: {
                stockQty: heads,
                stockBags: bags,
                stockKilos: kilos,
                stockHeads: heads,
              },
            },
            { new: true, session: mongoSession }
          );

          if (!mainProduct) {
            fail(
              404,
              `${item.mainProductName} no longer exists. Cannot void this batch.`
            );
          }

          const mainNewStock = Number(mainProduct.stockQty || 0);

          transactions.push({
            bodegaProductId: mainProduct._id,
            type: "VOID_REVERSAL",
            quantity: heads,
            bags,
            kilos,
            heads,
            pieces: 0,
            previousStock: mainNewStock - heads,
            newStock: mainNewStock,
            remarks: `VOID SLICING ${batch._id}`,
            referenceType: "SLICING_VOID",
            referenceId: batch._id,
            createdBy: session?.user?.id,
          });
        }

        // Deduct sliced product stock. The conditional $gte guard refuses to
        // void when output has already been sold/delivered, instead of
        // silently clamping to zero and corrupting the stock ledger.
        if (slicedPcs > 0) {
          const slicedProduct = await BodegaProductModel.findOneAndUpdate(
            { _id: item.slicedProductId, stockQty: { $gte: slicedPcs } },
            { $inc: { stockQty: -slicedPcs } },
            { new: true, session: mongoSession }
          );

          if (!slicedProduct) {
            const current = await BodegaProductModel.findById(
              item.slicedProductId
            )
              .select("stockQty")
              .session(mongoSession)
              .lean();

            const available = Number((current as any)?.stockQty ?? 0);

            fail(
              400,
              `Cannot void: ${item.slicedProductName} only has ${available} pcs in stock but this batch produced ${slicedPcs} pcs. Some output was already sold or delivered. Void or adjust those records first.`
            );
          }

          const slicedNewStock = Number(slicedProduct.stockQty || 0);

          transactions.push({
            bodegaProductId: slicedProduct._id,
            type: "VOID_REVERSAL",
            quantity: slicedPcs,
            bags: 0,
            kilos: 0,
            heads: 0,
            pieces: slicedPcs,
            previousStock: slicedNewStock + slicedPcs,
            newStock: slicedNewStock,
            remarks: `VOID SLICING ${batch._id}`,
            referenceType: "SLICING_VOID",
            referenceId: batch._id,
            createdBy: session?.user?.id,
          });
        }
      }

      if (transactions.length > 0) {
        await BodegaStockTransactionModel.insertMany(transactions, {
          session: mongoSession,
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: "Slicing batch voided successfully.",
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
      { success: false, message: "Unable to void slicing batch." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}

export const DELETE = withAuditLog(handleDELETE, {
  module: "SLICING",
  action: "VOID",
  entityType: "SLICING_BATCH",
});
