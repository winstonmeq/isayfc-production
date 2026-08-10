// app/api/bodega-products/[id]/stock-in/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString } from "@/lib/crud-utils";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";

async function handlePOST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission("bodega-products.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid bodega product ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const body = await req.json();

  const quantity = cleanNumber(body.quantity);
  const remarks = cleanString(body.remarks) || "MANUAL BODEGA STOCK IN";

  if (quantity <= 0) {
    return NextResponse.json(
      {
        success: false,
        message: "Quantity must be greater than zero.",
      },
      { status: 400 }
    );
  }

  const transactionDate = body.transactionDate
    ? new Date(cleanString(body.transactionDate))
    : new Date();
  const mongoSession = await mongoose.startSession();
  let product: any;

  try {
    await mongoSession.withTransaction(async () => {
      product = await BodegaProductModel.findOneAndUpdate(
        { _id: id, isActive: true },
        { $inc: { stockQty: quantity } },
        { new: true, session: mongoSession }
      );

      if (!product) throw new Error("Bodega product not found.");

      const newStock = Number(product.stockQty || 0);
      await BodegaStockTransactionModel.create(
        [{
          bodegaProductId: product._id,
          transactionDate,
          type: "STOCK_IN",
          quantity,
          previousStock: newStock - quantity,
          newStock,
          remarks,
          referenceType: "MANUAL_BODEGA_STOCK_IN",
          createdBy: session?.user?.id,
        }],
        { session: mongoSession }
      );
    });
  } finally {
    await mongoSession.endSession();
  }

  return NextResponse.json({
    success: true,
    message: "Bodega product stock added successfully.",
    data: {
      _id: product._id.toString(),
      stockQty: product.stockQty,
    },
  });
}

export const POST = withAuditLog(handlePOST, {
  module: "BODEGA_PRODUCTS",
  action: "STOCK_IN",
  entityType: "BODEGA_PRODUCT",
});
