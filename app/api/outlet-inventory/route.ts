import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId, Types } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import {
  cleanNumber,
  cleanString,
  escapeRegex,
  getPagination,
} from "@/lib/crud-utils";
import OutletModel from "@/models/Outlet";
import OutletInventoryModel, {
  OutletInventorySource,
  OutletInventoryUnit,
} from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import AuditLogModel from "@/models/AuditLog";
import ProductModel from "@/models/Product";
import BodegaProductModel from "@/models/BodegaProduct";
import StandardPackingModel from "@/models/StandardPacking";
import { classifyOutletInventoryRows, outletProductClassification } from "@/lib/outlet-product-classification";

const productSources: OutletInventorySource[] = ["BODEGA", "GROCERY"];
const unitLabels: OutletInventoryUnit[] = ["PCS", "PACK", "QTY", "KG", "BAG"];

function isProductSource(value: string): value is OutletInventorySource {
  return productSources.includes(value as OutletInventorySource);
}

function isUnitLabel(value: string): value is OutletInventoryUnit {
  return unitLabels.includes(value as OutletInventoryUnit);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function idToString(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (typeof value === "object" && "toString" in value) return String(value.toString());
  return "";
}

function getPackBreakdown(quantityValue: unknown, packSizeValue: unknown) {
  const quantity = Math.max(0, Math.trunc(numberValue(quantityValue)));
  const packSize = Math.max(0, Math.trunc(numberValue(packSizeValue)));

  if (packSize <= 0) {
    return {
      totalPcs: quantity,
      packs: 0,
      loosePcs: quantity,
    };
  }

  const packs = Math.floor(quantity / packSize);
  const loosePcs = quantity - packs * packSize;

  return {
    totalPcs: quantity,
    packs,
    loosePcs,
  };
}

function formatStockDisplay(stockQty: unknown, packSizeValue: unknown, unitLabel: string) {
  const packSize = Math.max(0, Math.trunc(numberValue(packSizeValue)));
  const breakdown = getPackBreakdown(stockQty, packSize);

  if (packSize <= 0) {
    return `${breakdown.totalPcs.toLocaleString()} ${unitLabel.toLowerCase()}`;
  }

  return `${breakdown.packs.toLocaleString()} packs / ${breakdown.loosePcs.toLocaleString()} pcs loose - ${breakdown.totalPcs.toLocaleString()} pcs total`;
}

function serializeOutletInventory(item: any) {
  const outlet = item.outletId && typeof item.outletId === "object" ? item.outletId : null;
  const packSize = Math.max(0, Math.trunc(numberValue(item.packSize)));
  const stockBreakdown = getPackBreakdown(item.stockQty, packSize);

  return {
    _id: idToString(item._id),
    outletId: idToString(outlet?._id || item.outletId),
    outletName: outlet?.name || "",
    outletCode: outlet?.code || "",
    productSource: item.productSource || "GROCERY",
    productId: idToString(item.productId),
    productName: item.productName || "",
    categoryName: item.categoryName || "",
    stockQty: numberValue(item.stockQty),
    unitLabel: item.unitLabel || "QTY",
    packSize,
    stockPacks: stockBreakdown.packs,
    stockLoosePcs: stockBreakdown.loosePcs,
    stockDisplay: formatStockDisplay(item.stockQty, packSize, item.unitLabel || "QTY"),
    lowStockAlert: numberValue(item.lowStockAlert),
    isLowStock: numberValue(item.lowStockAlert) > 0 && numberValue(item.stockQty) <= numberValue(item.lowStockAlert),
    buyingPrice: numberValue(item.buyingPrice),
    sellingPrice: numberValue(item.sellingPrice),
    remarks: item.remarks || "",
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : undefined,
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : undefined,
  };
}

async function getProductSnapshot(productSource: OutletInventorySource, productId: string) {
  if (productSource === "BODEGA") {
    const product = await BodegaProductModel.findOne({ _id: productId, isActive: true })
      .populate("categoryId", "name")
      .lean() as any;

    if (!product) return null;

    const standard = await StandardPackingModel.findOne({
      isActive: true,
      productId: new Types.ObjectId(productId),
    })
      .select("standardPacking")
      .lean() as { standardPacking?: number } | null;

    return {
      productName: product.name || "",
      categoryName:
        product.categoryId && typeof product.categoryId === "object"
          ? product.categoryId.name || ""
          : "",
      buyingPrice: numberValue(product.buyingPrice),
      sellingPrice: numberValue(product.sellingPrice),
      packSize: Math.max(0, Math.trunc(numberValue(standard?.standardPacking))),
      unitLabel: "PCS" as OutletInventoryUnit,
    };
  }

  const product = await ProductModel.findOne({ _id: productId, isActive: true })
    .populate("categoryId", "name")
    .lean() as any;

  if (!product) return null;

  return {
    productName: product.name || "",
    categoryName:
      product.categoryId && typeof product.categoryId === "object"
        ? product.categoryId.name || ""
        : "",
    buyingPrice: numberValue(product.buyingPrice),
    sellingPrice: numberValue(product.unitPrice),
    packSize: 0,
    unitLabel: "QTY" as OutletInventoryUnit,
  };
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("outlet-inventory.view");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const search = cleanString(searchParams.get("search"));
  const outletId = cleanString(searchParams.get("outletId"));
  const source = cleanString(searchParams.get("source")).toUpperCase();
  const lowStockOnly = cleanString(searchParams.get("lowStockOnly")) === "1";

  const filter: Record<string, any> = {
    isActive: true,
  };

  if (outletId && isValidObjectId(outletId)) {
    filter.outletId = new Types.ObjectId(outletId);
  }

  if (isProductSource(source)) {
    filter.productSource = source;
  }

  if (search) {
    filter.$or = [
      { productName: { $regex: escapeRegex(search), $options: "i" } },
      { categoryName: { $regex: escapeRegex(search), $options: "i" } },
    ];
  }

  if (lowStockOnly) {
    filter.$expr = {
      $and: [
        { $gt: ["$lowStockAlert", 0] },
        { $lte: ["$stockQty", "$lowStockAlert"] },
      ],
    };
  }

  const [items, total, summaryRows] = await Promise.all([
    OutletInventoryModel.find(filter)
      .populate("outletId", "name code")
      .sort({ productSource: 1, productName: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    OutletInventoryModel.countDocuments(filter),
    OutletInventoryModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$productSource",
          products: { $sum: 1 },
          totalStockQty: { $sum: "$stockQty" },
          lowStockRows: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$lowStockAlert", 0] },
                    { $lte: ["$stockQty", "$lowStockAlert"] },
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

  return NextResponse.json({
    success: true,
    data: (await classifyOutletInventoryRows(items)).map(serializeOutletInventory),
    summary: {
      bySource: summaryRows.map((row) => ({
        source: row._id,
        products: row.products || 0,
        totalStockQty: row.totalStockQty || 0,
        lowStockRows: row.lowStockRows || 0,
      })),
    },
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

export async function POST(req: NextRequest) {
  const { response, session } = await requirePermission("outlet-inventory.manage");
  if (response) return response;

  await dbConnect();

  const body = await req.json();
  const outletId = cleanString(body.outletId);
  const productSourceInput = cleanString(body.productSource).toUpperCase();
  const productId = cleanString(body.productId);
  const stockQty = cleanNumber(body.stockQty);
  const lowStockAlert = cleanNumber(body.lowStockAlert);
  const remarks = cleanString(body.remarks);
  const unitInput = cleanString(body.unitLabel).toUpperCase();

  if (!outletId || !isValidObjectId(outletId)) {
    return NextResponse.json(
      { success: false, message: "Valid outlet is required." },
      { status: 400 }
    );
  }

  if (!productId || !isValidObjectId(productId)) {
    return NextResponse.json(
      { success: false, message: "Valid product is required." },
      { status: 400 }
    );
  }

  if (!isProductSource(productSourceInput)) {
    return NextResponse.json(
      { success: false, message: "Product source must be Bodega or Grocery." },
      { status: 400 }
    );
  }

  const outlet = await OutletModel.findOne({ _id: outletId, isActive: true }).lean();

  if (!outlet) {
    return NextResponse.json(
      { success: false, message: "Outlet not found." },
      { status: 404 }
    );
  }

  const existing = await OutletInventoryModel.findOne({
    outletId,
    productSource: productSourceInput,
    productId,
    isActive: true,
  }).lean();

  if (existing) {
    return NextResponse.json(
      { success: false, message: "This product already exists in this outlet inventory." },
      { status: 409 }
    );
  }

  const snapshot = await getProductSnapshot(productSourceInput, productId);

  if (!snapshot) {
    return NextResponse.json(
      { success: false, message: "Product not found." },
      { status: 404 }
    );
  }

  const inventory = await OutletInventoryModel.create({
    outletId,
    productSource: productSourceInput,
    productId,
    productName: snapshot.productName,
    ...await outletProductClassification(productSourceInput, productId, undefined, snapshot.categoryName),
    stockQty,
    unitLabel: isUnitLabel(unitInput) ? unitInput : snapshot.unitLabel,
    packSize: snapshot.packSize,
    lowStockAlert,
    buyingPrice: snapshot.buyingPrice,
    sellingPrice: snapshot.sellingPrice,
    remarks,
    createdBy: session?.user?.id,
  });

  if (stockQty > 0) {
    await OutletStockTransactionModel.create({
      outletId,
      outletInventoryId: inventory._id,
      productSource: productSourceInput,
      productId,
      productName: snapshot.productName,
      transactionDate: new Date(),
      type: "STOCK_IN",
      quantity: stockQty,
      previousStock: 0,
      newStock: stockQty,
      referenceType: "OPENING_BALANCE",
      sourceChannel: "WEB",
      remarks: remarks || "OPENING BALANCE",
      createdBy: session?.user?.id,
    });
  }

  await AuditLogModel.create({
    outletId: inventory.outletId,
    module: "OUTLET INVENTORY",
    action: "CREATE",
    entityType: "OUTLET_INVENTORY",
    entityId: inventory._id,
    newValue: inventory.toObject(),
    sourceChannel: "WEB",
    createdBy: session?.user?.id,
  });

  return NextResponse.json(
    {
      success: true,
      message: "Outlet inventory item created successfully.",
      data: serializeOutletInventory(inventory.toObject()),
    },
    { status: 201 }
  );
}
