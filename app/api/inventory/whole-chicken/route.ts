import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { cleanString, escapeRegex } from "@/lib/crud-utils";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import { activeMovementTransactions } from "@/lib/stock-movement-report";
import StandardPackingModel from "@/models/StandardPacking";

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function objectIdString(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toString" in value) {
    return String((value as { toString: () => string }).toString());
  }
  return String(value);
}

function getDirection(transaction: any): "IN" | "OUT" | "NONE" {
  const previousStock = numberValue(transaction.previousStock);
  const newStock = numberValue(transaction.newStock);

  if (newStock > previousStock) return "IN";
  if (newStock < previousStock) return "OUT";

  const type = String(transaction.type || "").toUpperCase();
  if (type === "STOCK_IN" || type === "VOID_REVERSAL") return "IN";
  if (["STOCK_OUT", "SALE", "DAMAGED", "EXPIRED"].includes(type)) return "OUT";

  return "NONE";
}

function getMovementQuantity(transaction: any) {
  const explicitQuantity = numberValue(transaction.quantity);
  if (explicitQuantity > 0) return explicitQuantity;

  return Math.abs(numberValue(transaction.newStock) - numberValue(transaction.previousStock));
}

async function getWholeChickenProductIds() {
  const standards = await (StandardPackingModel as any)
    .find({ isActive: true, wholeChickenId: { $exists: true, $ne: null } })
    .select("wholeChickenId")
    .lean();

  return Array.from(
    new Set(
      (standards as any[])
        .map((standard) => objectIdString(standard.wholeChickenId))
        .filter(Boolean)
    )
  );
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(["inventory.view", "inventory.manage"]);
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const search = cleanString(searchParams.get("search"));
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));

  const wholeChickenProductIds = await getWholeChickenProductIds();
  const productFilter: Record<string, any> = {
    isActive: true,
    _id: { $in: wholeChickenProductIds },
  };

  if (search) {
    productFilter.name = { $regex: escapeRegex(search), $options: "i" };
  }

  const products = await (BodegaProductModel as any)
    .find(productFilter)
    .sort({ name: 1 })
    .lean();

  const productIds = (products as any[])
    .map((product) => objectIdString(product._id))
    .filter(Boolean);

  const transactionFilter: Record<string, any> = {
    bodegaProductId: { $in: productIds },
  };

  if (dateFrom || dateTo) {
    transactionFilter.createdAt = {};
    if (dateFrom) transactionFilter.createdAt.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
    if (dateTo) transactionFilter.createdAt.$lte = new Date(`${dateTo}T23:59:59.999Z`);
  }

  const transactions = await (BodegaStockTransactionModel as any)
    .find(transactionFilter)
    .sort({ createdAt: -1 })
    .lean();

  const movementMap = new Map<
    string,
    {
      stockIn: number;
      stockOut: number;
      inBags: number;
      outBags: number;
      inKilos: number;
      outKilos: number;
      inHeads: number;
      outHeads: number;
      latestDate?: Date;
    }
  >();

  for (const transaction of activeMovementTransactions(transactions as any[])) {
    const productId = objectIdString(transaction.bodegaProductId);
    if (!productId) continue;

    const direction = getDirection(transaction);
    const quantity = getMovementQuantity(transaction);
    const current = movementMap.get(productId) || {
      stockIn: 0,
      stockOut: 0,
      inBags: 0,
      outBags: 0,
      inKilos: 0,
      outKilos: 0,
      inHeads: 0,
      outHeads: 0,
      latestDate: undefined,
    };

    if (direction === "IN") current.stockIn += quantity;
    if (direction === "OUT") current.stockOut += quantity;
    if (direction === "IN") {
      current.inBags += numberValue(transaction.bags);
      current.inKilos += numberValue(transaction.kilos);
      current.inHeads += numberValue(transaction.heads) || quantity;
    }
    if (direction === "OUT") {
      current.outBags += numberValue(transaction.bags);
      current.outKilos += numberValue(transaction.kilos);
      current.outHeads += numberValue(transaction.heads) || quantity;
    }

    if (
      transaction.createdAt &&
      (!current.latestDate || new Date(transaction.createdAt) > new Date(current.latestDate))
    ) {
      current.latestDate = transaction.createdAt;
    }

    movementMap.set(productId, current);
  }

  const data = (products as any[]).map((product) => {
    const id = objectIdString(product._id);
    const movement = movementMap.get(id) || {
      stockIn: 0,
      stockOut: 0,
      inBags: 0,
      outBags: 0,
      inKilos: 0,
      outKilos: 0,
      inHeads: 0,
      outHeads: 0,
      latestDate: product.updatedAt || product.createdAt,
    };

    return {
      _id: id,
      product: product.name,
      productName: product.name,

      // Compatibility with the existing UI names.
      inPcs: numberValue(movement.stockIn),
      inBags: numberValue(movement.inBags),
      inKilos: numberValue(movement.inKilos),
      outQty: numberValue(movement.stockOut),
      currentPcs: numberValue(product.stockQty),
      outBags: numberValue(movement.outBags),
      outKilos: numberValue(movement.outKilos),
      currentBags: numberValue(product.stockBags),
      currentKilos: numberValue(product.stockKilos),

      // Clear owner-facing names.
      stockInHeads: numberValue(movement.inHeads || movement.stockIn),
      stockOutHeads: numberValue(movement.outHeads || movement.stockOut),
      currentHeads: numberValue(product.stockHeads || product.stockQty),

      updated: movement.latestDate
        ? new Date(movement.latestDate).toISOString()
        : product.updatedAt
          ? new Date(product.updatedAt).toISOString()
          : product.createdAt
            ? new Date(product.createdAt).toISOString()
            : undefined,
    };
  });

  const totals = data.reduce(
    (sum, row) => ({
      inPcs: sum.inPcs + row.inPcs,
      inBags: sum.inBags + row.inBags,
      inKilos: sum.inKilos + row.inKilos,
      outBags: sum.outBags + row.outBags,
      outKilos: sum.outKilos + row.outKilos,
      currentBags: sum.currentBags + row.currentBags,
      currentKilos: sum.currentKilos + row.currentKilos,
      outQty: sum.outQty + row.outQty,
      currentPcs: sum.currentPcs + row.currentPcs,
      stockInHeads: sum.stockInHeads + row.stockInHeads,
      stockOutHeads: sum.stockOutHeads + row.stockOutHeads,
      currentHeads: sum.currentHeads + row.currentHeads,
    }),
    {
      inPcs: 0,
      inBags: 0,
      inKilos: 0,
      outBags: 0,
      outKilos: 0,
      currentBags: 0,
      currentKilos: 0,
      outQty: 0,
      currentPcs: 0,
      stockInHeads: 0,
      stockOutHeads: 0,
      currentHeads: 0,
    }
  );

  return NextResponse.json({ success: true, data, totals });
}
