import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { cleanString, escapeRegex } from "@/lib/crud-utils";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import StandardPackingModel from "@/models/StandardPacking";
import {
  fromBaseQuantity,
  packingSnapshot,
  toBaseUnitCost,
} from "@/lib/inventory-units";
import { activeMovementTransactions } from "@/lib/stock-movement-report";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toWhole(value: unknown) {
  return Math.max(0, Math.trunc(toNumber(value)));
}

function objectIdString(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toString" in value) {
    return String((value as { toString: () => string }).toString());
  }
  return String(value);
}

function getPackBreakdown(totalPcsValue: unknown, packSizeValue: unknown) {
  const packSize = toWhole(packSizeValue);
  const packing = packingSnapshot({
    unit: packSize > 0 ? "PACK" : "PCS",
    baseUnit: "PCS",
    multiplier: packSize,
  });
  const breakdown = fromBaseQuantity(totalPcsValue, packing);
  return {
    totalPcs: breakdown.baseQty,
    packSize,
    packs: breakdown.fullUnits,
    loosePcs: breakdown.looseBaseQty,
  };
}

function getMovementDirection(transaction: any): "IN" | "OUT" | "NONE" {
  const previousStock = toNumber(transaction.previousStock);
  const newStock = toNumber(transaction.newStock);

  if (newStock > previousStock) return "IN";
  if (newStock < previousStock) return "OUT";

  const type = String(transaction.type || "").toUpperCase();
  if (type === "STOCK_IN" || type === "VOID_REVERSAL") return "IN";
  if (["STOCK_OUT", "SALE", "DAMAGED", "EXPIRED"].includes(type)) return "OUT";

  return "NONE";
}

function getMovementQuantity(transaction: any) {
  const explicitQuantity = toNumber(transaction.quantity);
  if (explicitQuantity > 0) return explicitQuantity;

  const previousStock = toNumber(transaction.previousStock);
  const newStock = toNumber(transaction.newStock);
  return Math.abs(newStock - previousStock);
}

async function buildPackSizeMap(productIds: string[]) {
  const packSizeMap = new Map<string, number>();
  if (productIds.length === 0) return packSizeMap;

  const standards = await (StandardPackingModel as any)
    .find({
      isActive: true,
      productId: { $in: productIds },
      standardPacking: { $gt: 0 },
    })
    .sort({ updatedAt: -1 })
    .lean();

  for (const standard of standards as any[]) {
    const productId = objectIdString(standard.productId);
    const packSize = toWhole(standard.standardPacking);

    if (!productId || packSize <= 0) continue;
    if (!packSizeMap.has(productId)) {
      packSizeMap.set(productId, packSize);
    }
  }

  return packSizeMap;
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("inventory.view");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const search = cleanString(searchParams.get("search"));
  const stockStatus = cleanString(searchParams.get("stockStatus")).toUpperCase();
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));

  const productFilter: Record<string, any> = { isActive: true };
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
    if (dateFrom) {
      transactionFilter.createdAt.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo) {
      transactionFilter.createdAt.$lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
  }

  const [transactions, packSizeMap] = await Promise.all([
    (BodegaStockTransactionModel as any)
      .find(transactionFilter)
      .sort({ createdAt: -1 })
      .lean(),
    buildPackSizeMap(productIds),
  ]);

  const movementMap = new Map<
    string,
    {
      stockIn: number;
      stockOut: number;
      stockInBags: number;
      stockOutBags: number;
      stockInKilos: number;
      stockOutKilos: number;
      stockInHeads: number;
      stockOutHeads: number;
      latestDate?: Date;
    }
  >();

  for (const transaction of activeMovementTransactions(transactions as any[])) {
    const productId = objectIdString(transaction.bodegaProductId);
    if (!productId) continue;

    const direction = getMovementDirection(transaction);
    const quantity = getMovementQuantity(transaction);
    const current = movementMap.get(productId) || {
      stockIn: 0,
      stockOut: 0,
      stockInBags: 0,
      stockOutBags: 0,
      stockInKilos: 0,
      stockOutKilos: 0,
      stockInHeads: 0,
      stockOutHeads: 0,
      latestDate: undefined,
    };

    if (direction === "IN") current.stockIn += quantity;
    if (direction === "OUT") current.stockOut += quantity;
    if (direction === "IN") {
      current.stockInBags += toNumber(transaction.bags);
      current.stockInKilos += toNumber(transaction.kilos);
      current.stockInHeads += toNumber(transaction.heads);
    }
    if (direction === "OUT") {
      current.stockOutBags += toNumber(transaction.bags);
      current.stockOutKilos += toNumber(transaction.kilos);
      current.stockOutHeads += toNumber(transaction.heads);
    }
    if (
      transaction.createdAt &&
      (!current.latestDate || new Date(transaction.createdAt) > new Date(current.latestDate))
    ) {
      current.latestDate = transaction.createdAt;
    }

    movementMap.set(productId, current);
  }

  const allData = (products as any[]).map((product) => {
    const id = objectIdString(product._id);
    const movement = movementMap.get(id) || {
      stockIn: 0,
      stockOut: 0,
      stockInBags: 0,
      stockOutBags: 0,
      stockInKilos: 0,
      stockOutKilos: 0,
      stockInHeads: 0,
      stockOutHeads: 0,
      latestDate: product.updatedAt || product.createdAt,
    };

    const packSize = packSizeMap.get(id) || 0;
    const isPackProduct = packSize > 0;
    const stockInBreakdown = getPackBreakdown(movement.stockIn, packSize);
    const stockOutBreakdown = getPackBreakdown(movement.stockOut, packSize);
    const currentBreakdown = getPackBreakdown(product.stockQty, packSize);
    const price = toNumber(product.sellingPrice || product.buyingPrice || 0);
    const pricePerPcs = toBaseUnitCost(
      price,
      packingSnapshot({
        unit: isPackProduct ? "PACK" : "PCS",
        baseUnit: "PCS",
        multiplier: packSize,
      })
    );

    const currentStock = toNumber(product.stockQty);
    const isLowStock =
      currentStock > 0 &&
      (isPackProduct ? currentStock <= packSize * 3 : currentStock <= 10);

    return {
      _id: id,
      product: product.name,
      productName: product.name,

      stockIn: toNumber(movement.stockIn),
      stockOut: toNumber(movement.stockOut),
      currentStock,
      currentBags: toNumber(product.stockBags),
      currentKilos: toNumber(product.stockKilos),
      currentHeads: toNumber(product.stockHeads || product.stockQty),
      stockInBags: movement.stockInBags,
      stockOutBags: movement.stockOutBags,
      stockInKilos: movement.stockInKilos,
      stockOutKilos: movement.stockOutKilos,
      stockInHeads: movement.stockInHeads,
      stockOutHeads: movement.stockOutHeads,
      currentStockPcs: currentBreakdown.totalPcs,

      price,
      pricePerPack: isPackProduct ? price : 0,
      pricePerPcs,
      stockUnit: isPackProduct ? "PACK_PCS" : "UNIT",
      isPackProduct,
      packSize,
      stockStatus: currentStock <= 0 ? "OUT" : isLowStock ? "LOW" : "OK",

      stockInPcs: stockInBreakdown.totalPcs,
      stockInPacks: stockInBreakdown.packs,
      stockInLoosePcs: stockInBreakdown.loosePcs,
      stockOutPcs: stockOutBreakdown.totalPcs,
      stockOutPacks: stockOutBreakdown.packs,
      stockOutLoosePcs: stockOutBreakdown.loosePcs,

      currentPacks: currentBreakdown.packs,
      currentLoosePcs: currentBreakdown.loosePcs,
      currentStockPacks: currentBreakdown.packs,
      currentStockLoosePcs: currentBreakdown.loosePcs,

      dateAdded: movement.latestDate
        ? new Date(movement.latestDate).toISOString()
        : product.updatedAt
          ? new Date(product.updatedAt).toISOString()
          : product.createdAt
            ? new Date(product.createdAt).toISOString()
            : undefined,
    };
  });

  const data = allData.filter((row) =>
    stockStatus === "IN_STOCK"
      ? row.currentStock > 0
      : stockStatus === "LOW"
      ? row.stockStatus === "LOW"
      : stockStatus === "OUT"
        ? row.stockStatus === "OUT"
        : true
  );

  const totals = data.reduce(
    (sum, row) => {
      sum.raw.stockIn += row.stockIn;
      sum.raw.stockOut += row.stockOut;
      sum.raw.currentStock += row.currentStock;

      if (row.isPackProduct) {
        sum.sliced.stockInPcs += row.stockIn;
        sum.sliced.stockOutPcs += row.stockOut;
        sum.sliced.currentPcs += row.currentStock;
      } else {
        sum.whole.stockIn += row.stockIn;
        sum.whole.stockOut += row.stockOut;
        sum.whole.currentStock += row.currentStock;
      }

      return sum;
    },
    {
      raw: { stockIn: 0, stockOut: 0, currentStock: 0 },
      sliced: { stockInPcs: 0, stockOutPcs: 0, currentPcs: 0 },
      whole: { stockIn: 0, stockOut: 0, currentStock: 0 },
    }
  );

  return NextResponse.json({
    success: true,
    data,
    totals: {
      ...totals,
      stockIn: totals.raw.stockIn,
      stockOut: totals.raw.stockOut,
      currentStock: totals.raw.currentStock,
      slicedStockInPcs: totals.sliced.stockInPcs,
      slicedStockOutPcs: totals.sliced.stockOutPcs,
      slicedCurrentPcs: totals.sliced.currentPcs,
      unitStockIn: totals.whole.stockIn,
      unitStockOut: totals.whole.stockOut,
      unitCurrentStock: totals.whole.currentStock,
    },
  });
}
