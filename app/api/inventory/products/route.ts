import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString, escapeRegex, getPagination } from "@/lib/crud-utils";
import { addDays } from "@/lib/date-utils";
import CategoryModel from "@/models/Category";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import ProductModel from "@/models/Product";
import { activeMovementTransactions } from "@/lib/stock-movement-report";

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

type ProductMovement = {
  stockInPcs: number;
  stockOutPcs: number;
  stockInBags: number;
  stockOutBags: number;
  stockInKilos: number;
  stockOutKilos: number;
};

function serializeProduct(product: any, movement?: ProductMovement) {
  const stockPcs = Number(product.stockPcs || 0);
  const stockBags = Number(product.stockBags || 0);
  const stockKilos = Number(product.stockKilos || 0);
  const buyingPrice = Number(product.buyingPrice || 0);
  const unitPrice = Number(product.unitPrice || 0);
  const lowStockAlert = Number(product.lowStockAlert || 0);
  const isLowStock = lowStockAlert > 0 && stockPcs <= lowStockAlert;

  return {
    _id: product._id?.toString?.() || String(product._id),
    name: product.name || "",
    categoryId: product.categoryId?._id?.toString?.() || product.categoryId?.toString?.() || "",
    categoryName: product.categoryId?.name || "",
    buyingPrice,
    unitPrice,
    stockPcs,
    stockBags,
    stockKilos,
    stockInPcs: movement?.stockInPcs || 0,
    stockOutPcs: movement?.stockOutPcs || 0,
    stockInBags: movement?.stockInBags || 0,
    stockOutBags: movement?.stockOutBags || 0,
    stockInKilos: movement?.stockInKilos || 0,
    stockOutKilos: movement?.stockOutKilos || 0,
    lowStockAlert,
    isLowStock,
    estimatedCostValue: roundMoney(stockPcs * buyingPrice),
    estimatedSellingValue: roundMoney(stockPcs * unitPrice),
    createdAt: product.createdAt ? new Date(product.createdAt).toISOString() : undefined,
    updatedAt: product.updatedAt ? new Date(product.updatedAt).toISOString() : undefined,
  };
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("inventory.view");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const search = cleanString(searchParams.get("search"));
  const categoryId = cleanString(searchParams.get("categoryId"));
  const stockStatus = cleanString(searchParams.get("stockStatus"));
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));

  const filter: Record<string, unknown> = { isActive: true };

  if (search) {
    filter.$or = [
      { name: { $regex: escapeRegex(search), $options: "i" } },
    ];
  }

  if (categoryId && categoryId !== "ALL" && isValidObjectId(categoryId)) {
    filter.categoryId = categoryId;
  }

  if (stockStatus === "LOW") {
    filter.$expr = {
      $and: [
        { $gt: ["$lowStockAlert", 0] },
        { $lte: ["$stockPcs", "$lowStockAlert"] },
      ],
    };
  }

  if (stockStatus === "OUT") {
    filter.stockPcs = { $lte: 0 };
  }

  const movementDateFilter: Record<string, Date> = {};
  if (dateFrom || dateTo) {
    if (dateFrom) {
      const start = new Date(`${dateFrom}T00:00:00+08:00`);
      if (!Number.isNaN(start.getTime())) movementDateFilter.$gte = start;
    }
    if (dateTo) {
      const end = new Date(`${dateTo}T00:00:00+08:00`);
      if (!Number.isNaN(end.getTime())) {
        movementDateFilter.$lt = addDays(end, 1);
      }
    }
  }

  const [items, total, summaryRows] = await Promise.all([
    ProductModel.find(filter as any)
      .populate("categoryId", "name")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ProductModel.countDocuments(filter as any),
    ProductModel.aggregate([
      { $match: filter as any },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalPcs: { $sum: { $ifNull: ["$stockPcs", 0] } },
          totalBags: { $sum: { $ifNull: ["$stockBags", 0] } },
          totalKilos: { $sum: { $ifNull: ["$stockKilos", 0] } },
          totalCostValue: {
            $sum: {
              $multiply: [
                { $ifNull: ["$stockPcs", 0] },
                { $ifNull: ["$buyingPrice", 0] },
              ],
            },
          },
          totalSellingValue: {
            $sum: {
              $multiply: [
                { $ifNull: ["$stockPcs", 0] },
                { $ifNull: ["$unitPrice", 0] },
              ],
            },
          },
          lowStockCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: [{ $ifNull: ["$lowStockAlert", 0] }, 0] },
                    {
                      $lte: [
                        { $ifNull: ["$stockPcs", 0] },
                        { $ifNull: ["$lowStockAlert", 0] },
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const summary = summaryRows[0] || {
    totalProducts: 0,
    totalPcs: 0,
    totalBags: 0,
    totalKilos: 0,
    totalCostValue: 0,
    totalSellingValue: 0,
    lowStockCount: 0,
  };

  const productIds = (items as any[]).map((item) => item._id);
  const transactionFilter: Record<string, unknown> = {
    productId: { $in: productIds },
  };

  const transactions =
    productIds.length > 0
      ? await InventoryTransactionModel.find(transactionFilter)
          .sort({ createdAt: 1 })
          .lean()
      : [];
  const movementByProduct = new Map<string, ProductMovement>();

  for (const transaction of activeMovementTransactions(transactions as any[])) {
    const transactionDate = new Date(transaction.createdAt).getTime();
    if (
      movementDateFilter.$gte &&
      transactionDate < movementDateFilter.$gte.getTime()
    ) {
      continue;
    }
    if (
      movementDateFilter.$lt &&
      transactionDate >= movementDateFilter.$lt.getTime()
    ) {
      continue;
    }

    const productId = String(transaction.productId || "");
    if (!productId) continue;

    const movement = movementByProduct.get(productId) || {
      stockInPcs: 0,
      stockOutPcs: 0,
      stockInBags: 0,
      stockOutBags: 0,
      stockInKilos: 0,
      stockOutKilos: 0,
    };
    const previousStock = Number(transaction.previousStock || 0);
    const newStock = Number(transaction.newStock || 0);
    const quantity =
      Number(transaction.quantity || 0) ||
      Math.abs(newStock - previousStock);
    const direction =
      newStock > previousStock ? "IN" : newStock < previousStock ? "OUT" : "";
    const unit = String(transaction.unit || "").toUpperCase();
    const field =
      direction === "IN"
        ? unit === "BAGS"
          ? "stockInBags"
          : unit === "KILOS"
            ? "stockInKilos"
            : "stockInPcs"
        : direction === "OUT"
          ? unit === "BAGS"
            ? "stockOutBags"
            : unit === "KILOS"
              ? "stockOutKilos"
              : "stockOutPcs"
          : null;

    if (field) movement[field] += quantity;
    movementByProduct.set(productId, movement);
  }

  return NextResponse.json({
    success: true,
    data: items.map((item: any) =>
      serializeProduct(item, movementByProduct.get(String(item._id)))
    ),
    summary: {
      totalProducts: Number(summary.totalProducts || 0),
      totalPcs: Number(summary.totalPcs || 0),
      totalBags: Number(summary.totalBags || 0),
      totalKilos: Number(summary.totalKilos || 0),
      totalCostValue: roundMoney(Number(summary.totalCostValue || 0)),
      totalSellingValue: roundMoney(Number(summary.totalSellingValue || 0)),
      lowStockCount: Number(summary.lowStockCount || 0),
    },
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

async function handlePOST(req: NextRequest) {
  const { response } = await requirePermission("inventory.manage");
  if (response) return response;

  await dbConnect();

  const body = await req.json();
  const name = cleanString(body.name).toUpperCase();
  const categoryId = cleanString(body.categoryId);

  if (!name) {
    return NextResponse.json(
      { success: false, message: "Product name is required." },
      { status: 400 }
    );
  }

  if (!categoryId || !isValidObjectId(categoryId)) {
    return NextResponse.json(
      { success: false, message: "Valid category is required." },
      { status: 400 }
    );
  }

  const categoryExists = await CategoryModel.exists({ _id: categoryId, isActive: true });
  if (!categoryExists) {
    return NextResponse.json(
      { success: false, message: "Category not found." },
      { status: 404 }
    );
  }

  const duplicate = await ProductModel.exists({ name, categoryId, isActive: true });
  if (duplicate) {
    return NextResponse.json(
      { success: false, message: "Product already exists in this category." },
      { status: 409 }
    );
  }

  const product = await ProductModel.create({
    name,
    categoryId,
    buyingPrice: cleanNumber(body.buyingPrice),
    unitPrice: cleanNumber(body.unitPrice),
    stockPcs: cleanNumber(body.stockPcs),
    stockBags: cleanNumber(body.stockBags),
    stockKilos: cleanNumber(body.stockKilos),
    lowStockAlert: cleanNumber(body.lowStockAlert),
  });

  const savedProduct = await ProductModel.findById(product._id)
    .populate("categoryId", "name")
    .lean();

  return NextResponse.json(
    {
      success: true,
      message: "Grocery/Product item created successfully.",
      data: serializeProduct(savedProduct),
    },
    { status: 201 }
  );
}

export const POST = withAuditLog(handlePOST, {
  module: "INVENTORY",
  action: "CREATE",
  entityType: "PRODUCT",
});
