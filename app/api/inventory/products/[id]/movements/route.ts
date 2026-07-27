import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import { cleanString } from "@/lib/crud-utils";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { activeMovementTransactions } from "@/lib/stock-movement-report";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import ProductModel from "@/models/Product";

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function objectIdString(value: unknown) {
  return value ? String(value) : "";
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("inventory.view");
  if (response) return response;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid grocery product ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const product = await ProductModel.findOne({ _id: id, isActive: true })
    .populate("categoryId", "name")
    .lean();
  if (!product) {
    return NextResponse.json(
      { success: false, message: "Grocery product not found." },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(req.url);
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));
  const start = dateFrom
    ? new Date(`${dateFrom}T00:00:00+08:00`).getTime()
    : null;
  const end = dateTo
    ? new Date(`${dateTo}T23:59:59.999+08:00`).getTime()
    : null;

  const transactions = await InventoryTransactionModel.find({ productId: id })
    .sort({ createdAt: -1 })
    .lean();

  const activeTransactions = activeMovementTransactions(
    transactions as any[]
  ).filter((transaction) => {
    const timestamp = new Date(transaction.createdAt).getTime();
    if (start !== null && timestamp < start) return false;
    if (end !== null && timestamp > end) return false;
    return true;
  });

  return NextResponse.json({
    success: true,
    product: {
      _id: objectIdString(product._id),
      name: product.name || "",
      categoryName:
        typeof product.categoryId === "object" &&
        product.categoryId &&
        "name" in product.categoryId
          ? String(product.categoryId.name || "")
          : "",
      currentPcs: numberValue(product.stockPcs),
      currentBags: numberValue(product.stockBags),
      currentKilos: numberValue(product.stockKilos),
      lastUpdated: product.updatedAt
        ? new Date(product.updatedAt).toISOString()
        : undefined,
    },
    data: activeTransactions.map((transaction) => {
      const previousStock = numberValue(transaction.previousStock);
      const newStock = numberValue(transaction.newStock);
      const direction =
        newStock > previousStock ? "IN" : newStock < previousStock ? "OUT" : "NONE";
      const quantity =
        numberValue(transaction.quantity) ||
        Math.abs(newStock - previousStock);
      const referenceType = String(transaction.referenceType || "").trim();
      const suffix = objectIdString(transaction._id).slice(-6).toUpperCase();

      return {
        _id: objectIdString(transaction._id),
        date: transaction.createdAt
          ? new Date(transaction.createdAt).toISOString()
          : undefined,
        type: direction,
        unit: transaction.unit || "PCS",
        reference: `${referenceType || direction}-${suffix}`,
        qtyIn: direction === "IN" ? quantity : 0,
        qtyOut: direction === "OUT" ? quantity : 0,
        previousStock,
        newStock,
        remarks: transaction.remarks || "",
      };
    }),
  });
}
