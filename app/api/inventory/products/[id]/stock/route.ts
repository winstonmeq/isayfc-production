import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString } from "@/lib/crud-utils";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import ProductModel from "@/models/Product";

type StockUnit = "PCS" | "BAGS" | "KILOS";
type StockAction = "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";

const STOCK_FIELD_BY_UNIT: Record<StockUnit, "stockPcs" | "stockBags" | "stockKilos"> = {
  PCS: "stockPcs",
  BAGS: "stockBags",
  KILOS: "stockKilos",
};

function normalizeUnit(value: unknown): StockUnit | null {
  const unit = String(value || "").toUpperCase();
  if (unit === "PCS" || unit === "BAGS" || unit === "KILOS") return unit;
  return null;
}

function normalizeAction(value: unknown): StockAction | null {
  const action = String(value || "").toUpperCase();
  if (action === "STOCK_IN" || action === "STOCK_OUT" || action === "ADJUSTMENT") {
    return action;
  }
  return null;
}

async function handlePOST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission("inventory.manage");
  if (response) return response;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid product ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const body = await req.json();
  const action = normalizeAction(body.action);
  const unit = normalizeUnit(body.unit);
  const quantity = cleanNumber(body.quantity);
  const newStockInput = cleanNumber(body.newStock);
  const remarks = cleanString(body.remarks) || "PRODUCT INVENTORY UPDATE";

  if (!action) {
    return NextResponse.json(
      { success: false, message: "Valid stock action is required." },
      { status: 400 }
    );
  }

  if (!unit) {
    return NextResponse.json(
      { success: false, message: "Valid stock unit is required." },
      { status: 400 }
    );
  }

  if (action !== "ADJUSTMENT" && quantity <= 0) {
    return NextResponse.json(
      { success: false, message: "Quantity must be greater than zero." },
      { status: 400 }
    );
  }

  const transactionDate = body.transactionDate
    ? new Date(cleanString(body.transactionDate))
    : new Date();
  const mongoSession = await mongoose.startSession();
  let product: any;
  let previousStock = 0;
  let newStock = 0;
  let transactionQuantity = quantity;

  try {
    await mongoSession.withTransaction(async () => {
      product = await ProductModel.findOne({ _id: id, isActive: true }).session(mongoSession);
      if (!product) throw new Error("Product not found.");

      const field = STOCK_FIELD_BY_UNIT[unit];
      previousStock = Number(product[field] || 0);
      newStock = previousStock;

      if (action === "STOCK_IN") newStock = previousStock + quantity;
      if (action === "STOCK_OUT") {
        if (quantity > previousStock) {
          throw new Error("Stock out quantity is greater than current stock.");
        }
        newStock = previousStock - quantity;
      }
      if (action === "ADJUSTMENT") {
        newStock = newStockInput;
        transactionQuantity = Math.abs(newStock - previousStock);
      }
      if (newStock < 0) throw new Error("New stock cannot be negative.");

      product[field] = newStock;
      await product.save({ session: mongoSession });

      await InventoryTransactionModel.create(
        [{
          productId: product._id,
          transactionDate,
          type: action,
          unit,
          quantity: transactionQuantity,
          previousStock,
          newStock,
          remarks,
          referenceType: "PRODUCT_INVENTORY_CRUD",
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
    message: "Product inventory stock updated successfully.",
    data: {
      _id: product._id.toString(),
      stockPcs: Number(product.stockPcs || 0),
      stockBags: Number(product.stockBags || 0),
      stockKilos: Number(product.stockKilos || 0),
    },
  });
}

export const POST = withAuditLog(handlePOST, {
  module: "INVENTORY",
  action: "STOCK_ADJUSTMENT",
  entityType: "PRODUCT",
});
