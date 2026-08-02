import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId, type QueryFilter } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { PRODUCT_LOOKUP_PERMISSIONS } from "@/lib/role-permissions";
import { withAuditLog } from "@/lib/audit-log";
import {
  cleanNumber,
  cleanString,
  escapeRegex,
  getPagination,
} from "@/lib/crud-utils";
import CategoryModel from "@/models/Category";
import ProductModel from "@/models/Product";

function serializeProduct(product: any) {
  return {
    _id: product._id.toString(),
    name: product.name,
    categoryId: product.categoryId?._id?.toString?.() || product.categoryId?.toString?.(),
    categoryName: product.categoryId?.name || "",
    buyingPrice: product.buyingPrice || 0,
    unitPrice: product.unitPrice || 0,
    stockPcs: product.stockPcs || 0,
    stockBags: product.stockBags || 0,
    stockKilos: product.stockKilos || 0,
    lowStockAlert: product.lowStockAlert || 0,
    createdAt: product.createdAt ? new Date(product.createdAt).toISOString() : undefined,
    updatedAt: product.updatedAt ? new Date(product.updatedAt).toISOString() : undefined,
  };
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(PRODUCT_LOOKUP_PERMISSIONS);
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const search = cleanString(searchParams.get("search"));
  const categoryId = cleanString(searchParams.get("categoryId"));

  const filter: QueryFilter<any> = {
    isActive: true,
  };

  if (search) {
    filter.name = {
      $regex: escapeRegex(search),
      $options: "i",
    };
  }

  if (categoryId && isValidObjectId(categoryId)) {
    filter.categoryId = categoryId;
  }

  const [items, total] = await Promise.all([
    ProductModel.find(filter)
      .populate("categoryId", "name")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ProductModel.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map(serializeProduct),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

async function handlePOST(req: NextRequest) {
  const { response } = await requirePermission("products.manage");
  if (response) return response;

  await dbConnect();

  const body = await req.json();
  const name = cleanString(body.name);
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

  const categoryExists = await CategoryModel.exists({
    _id: categoryId,
    isActive: true,
  });

  if (!categoryExists) {
    return NextResponse.json(
      { success: false, message: "Category not found." },
      { status: 404 }
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

  const populatedProduct = await ProductModel.findById(product._id)
    .populate("categoryId", "name")
    .lean();

  return NextResponse.json(
    {
      success: true,
      message: "Product created successfully.",
      data: serializeProduct(populatedProduct),
    },
    { status: 201 }
  );
}

export const POST = withAuditLog(handlePOST, {
  module: "PRODUCTS",
  action: "CREATE",
  entityType: "PRODUCT",
});
