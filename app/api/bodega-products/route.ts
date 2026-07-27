import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId, Types } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { BODEGA_PRODUCT_LOOKUP_PERMISSIONS } from "@/lib/role-permissions";
import {
  cleanNumber,
  cleanString,
  escapeRegex,
  getPagination,
} from "@/lib/crud-utils";
import BodegaProductModel from "@/models/BodegaProduct";
import CategoryModel from "@/models/Category";
import StandardPackingModel from "@/models/StandardPacking";
import {
  formatStock,
  fromBaseQuantity,
  packingSnapshot,
  toBaseUnitCost,
} from "@/lib/inventory-units";

type PopulatedCategory = {
  _id?: Types.ObjectId | string;
  name?: string;
};

type LeanBodegaProduct = {
  _id: Types.ObjectId | string;
  name?: string;
  categoryId?: PopulatedCategory | Types.ObjectId | string | null;
  stockQty?: number;
  buyingPrice?: number;
  sellingPrice?: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

type LeanStandardPacking = {
  _id?: Types.ObjectId | string;
  productId?: Types.ObjectId | string | null;
  standardPacking?: number;
  chickenSizeType?: string;
  wholeChickenId?: { name?: string } | Types.ObjectId | string | null;
};

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

function getCategoryId(category: LeanBodegaProduct["categoryId"]) {
  if (!category) return "";
  if (typeof category === "string" || category instanceof Types.ObjectId) {
    return idToString(category);
  }
  return idToString(category._id);
}

function getCategoryName(category: LeanBodegaProduct["categoryId"]) {
  if (!category || typeof category === "string" || category instanceof Types.ObjectId) {
    return "";
  }
  return category.name || "";
}

function getPackBreakdown(quantityValue: unknown, packSizeValue: unknown) {
  const packSize = Math.max(0, Math.trunc(numberValue(packSizeValue)));
  const packing = packingSnapshot({
    unit: packSize > 0 ? "PACK" : "PCS",
    baseUnit: "PCS",
    multiplier: packSize,
  });
  const breakdown = fromBaseQuantity(quantityValue, packing);
  return {
    totalPcs: breakdown.baseQty,
    packs: breakdown.fullUnits,
    loosePcs: breakdown.looseBaseQty,
  };
}

function formatStockDisplay(stockQty: unknown, packSize: number) {
  const packing = packingSnapshot({
    unit: packSize > 0 ? "PACK" : "PCS",
    baseUnit: "PCS",
    multiplier: packSize,
  });
  return `${formatStock(stockQty, packing)} - ${numberValue(stockQty).toLocaleString()} pcs total`;
}

function serializeBodegaProduct(
  product: LeanBodegaProduct | null,
  packingOptions: Array<{
    _id: string;
    packSize: number;
    chickenSizeType: string;
    wholeChickenName: string;
  }> = []
) {
  if (!product) return null;

  const packSize = packingOptions[0]?.packSize || 0;
  const isPackProduct = packSize > 0;
  const stockBreakdown = getPackBreakdown(product.stockQty, packSize);
  const sellingPrice = numberValue(product.sellingPrice);
  const buyingPrice = numberValue(product.buyingPrice);
  const pricePerPack = isPackProduct ? sellingPrice : 0;
  const pricePerPcs = isPackProduct
    ? toBaseUnitCost(
        sellingPrice,
        packingSnapshot({
          unit: "PACK",
          baseUnit: "PCS",
          multiplier: packSize,
        })
      )
    : sellingPrice;

  return {
    _id: idToString(product._id),
    name: product.name || "",
    categoryId: getCategoryId(product.categoryId),
    categoryName: getCategoryName(product.categoryId),

    // Keep the original field for backward compatibility.
    // For sliced products, stockQty is the raw/base quantity in PCS.
    stockQty: numberValue(product.stockQty),

    // Owner-friendly pack display fields.
    isPackProduct,
    packSize,
    packingOptions,
    stockPcs: stockBreakdown.totalPcs,
    stockPacks: stockBreakdown.packs,
    stockLoosePcs: stockBreakdown.loosePcs,
    stockDisplay: formatStockDisplay(product.stockQty, packSize),

    buyingPrice,
    sellingPrice,

    // For products with a slicing standard, sellingPrice is treated as price per pack.
    pricePerPack,
    pricePerPcs,

    createdAt: product.createdAt ? new Date(product.createdAt).toISOString() : undefined,
    updatedAt: product.updatedAt ? new Date(product.updatedAt).toISOString() : undefined,
  };
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(BODEGA_PRODUCT_LOOKUP_PERMISSIONS);
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const search = cleanString(searchParams.get("search"));
  const categoryId = cleanString(searchParams.get("categoryId"));

  const filter: Record<string, unknown> = {
    isActive: true,
  };

  if (search) {
    filter.name = {
      $regex: escapeRegex(search),
      $options: "i",
    };
  }

  if (categoryId && isValidObjectId(categoryId)) {
    filter.categoryId = new Types.ObjectId(categoryId);
  }

  const [rawItems, total] = await Promise.all([
    BodegaProductModel.find(filter)
      .populate("categoryId", "name")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BodegaProductModel.countDocuments(filter),
  ]);

  const items = rawItems as LeanBodegaProduct[];
  const productIds = items
    .map((item) => idToString(item._id))
    .filter((id): id is string => Boolean(id) && isValidObjectId(id))
    .map((id) => new Types.ObjectId(id));

  const packingOptionsByProductId = new Map<
    string,
    Array<{
      _id: string;
      packSize: number;
      chickenSizeType: string;
      wholeChickenName: string;
    }>
  >();

  if (productIds.length > 0) {
    const standards = (await StandardPackingModel.find({
      isActive: true,
      productId: { $in: productIds },
    })
      .populate("wholeChickenId", "name")
      .select("productId standardPacking chickenSizeType wholeChickenId")
      .sort({ updatedAt: -1, _id: -1 })
      .lean()) as LeanStandardPacking[];

    for (const standard of standards) {
      const productId = idToString(standard.productId);
      const packSize = Math.max(0, Math.trunc(numberValue(standard.standardPacking)));

      if (!productId || packSize <= 0) continue;
      const wholeChicken =
        standard.wholeChickenId &&
        typeof standard.wholeChickenId === "object" &&
        !(standard.wholeChickenId instanceof Types.ObjectId) &&
        "name" in standard.wholeChickenId
          ? standard.wholeChickenId.name || ""
          : "";
      const options = packingOptionsByProductId.get(productId) || [];
      options.push({
        _id: idToString(standard._id),
        packSize,
        chickenSizeType: standard.chickenSizeType || "",
        wholeChickenName: wholeChicken,
      });
      packingOptionsByProductId.set(productId, options);
    }
  }

  return NextResponse.json({
    success: true,
    data: items
      .map((item) =>
        serializeBodegaProduct(
          item,
          packingOptionsByProductId.get(idToString(item._id)) || []
        )
      )
      .filter(Boolean),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

async function handlePOST(req: NextRequest) {
  const { response } = await requirePermission("bodega-products.manage");
  if (response) return response;

  await dbConnect();

  const body = await req.json();
  const name = cleanString(body.name);
  const categoryId = cleanString(body.categoryId);

  if (!name) {
    return NextResponse.json(
      {
        success: false,
        message: "Bodega product name is required.",
      },
      { status: 400 }
    );
  }

  if (categoryId && !isValidObjectId(categoryId)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid category.",
      },
      { status: 400 }
    );
  }

  if (categoryId) {
    const categoryExists = await CategoryModel.exists({
      _id: new Types.ObjectId(categoryId),
      isActive: true,
    });

    if (!categoryExists) {
      return NextResponse.json(
        {
          success: false,
          message: "Category not found.",
        },
        { status: 404 }
      );
    }
  }

  const product = await BodegaProductModel.create({
    name,
    categoryId: categoryId ? new Types.ObjectId(categoryId) : undefined,
    stockQty: cleanNumber(body.stockQty),
    buyingPrice: cleanNumber(body.buyingPrice),
    sellingPrice: cleanNumber(body.sellingPrice),
  });

  const populatedProduct = (await BodegaProductModel.findById(product._id)
    .populate("categoryId", "name")
    .lean()) as LeanBodegaProduct | null;

  return NextResponse.json(
    {
      success: true,
      message: "Bodega product created successfully.",
      data: serializeBodegaProduct(populatedProduct),
    },
    { status: 201 }
  );
}

export const POST = withAuditLog(handlePOST, {
  module: "BODEGA_PRODUCTS",
  action: "CREATE",
  entityType: "BODEGA_PRODUCT",
});
