import { isProductUsage, productUsage, productUsageLabel } from "@/lib/product-usage";
import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString } from "@/lib/crud-utils";
import CategoryModel from "@/models/Category";
import { categoryMatchesSource } from "@/lib/category-source";
import { isInventorySourceCategory, PRODUCT_CATEGORY_ERROR } from "@/lib/product-classification";
import ProductModel from "@/models/Product";

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function serializeProduct(product: any) {
  const stockPcs = Number(product.stockPcs || 0);
  const buyingPrice = Number(product.buyingPrice || 0);
  const unitPrice = Number(product.unitPrice || 0);
  const lowStockAlert = Number(product.lowStockAlert || 0);

  return {
    _id: product._id?.toString?.() || String(product._id),
    name: product.name || "",
    categoryId: product.categoryId?._id?.toString?.() || product.categoryId?.toString?.() || "",
    categoryName: product.categoryId?.name || "",
    usage: productUsage(product.usage),
    usageLabel: productUsageLabel(product.usage),
    buyingPrice,
    unitPrice,
    stockPcs,
    stockBags: Number(product.stockBags || 0),
    stockKilos: Number(product.stockKilos || 0),
    lowStockAlert,
    isLowStock: lowStockAlert > 0 && stockPcs <= lowStockAlert,
    estimatedCostValue: roundMoney(stockPcs * buyingPrice),
    estimatedSellingValue: roundMoney(stockPcs * unitPrice),
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("inventory.view");
  if (response) return response;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid product ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const product = await ProductModel.findOne({ _id: id, isActive: true })
    .populate("categoryId", "name")
    .lean();

  if (!product) {
    return NextResponse.json(
      { success: false, message: "Product not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: serializeProduct(product) });
}

async function handlePATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("inventory.manage");
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
  if (body.usage !== undefined && !isProductUsage(body.usage)) return NextResponse.json({ success: false, message: "Select a valid product usage." }, { status: 400 });
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

  const categoryExists = await CategoryModel.findOne({ _id: categoryId, isActive: true });
  if (isInventorySourceCategory(categoryExists?.name)) return NextResponse.json({ success: false, message: PRODUCT_CATEGORY_ERROR }, { status: 400 });
  if (categoryExists && !categoryMatchesSource(categoryExists.source, "GROCERY")) return NextResponse.json({ success: false, message: "Choose a grocery or Shared category for this product." }, { status: 400 });
  if (!categoryExists) {
    return NextResponse.json(
      { success: false, message: "Category not found." },
      { status: 404 }
    );
  }

  const duplicate = await ProductModel.exists({
    _id: { $ne: id },
    name,
    categoryId,
    isActive: true,
  });

  if (duplicate) {
    return NextResponse.json(
      { success: false, message: "Another product with the same name already exists in this category." },
      { status: 409 }
    );
  }

  const updatedProduct = await ProductModel.findOneAndUpdate(
    { _id: id, isActive: true },
    {
      name,
      categoryId,
      ...(body.usage !== undefined ? { usage: body.usage } : {}),
      buyingPrice: cleanNumber(body.buyingPrice),
      unitPrice: cleanNumber(body.unitPrice),
      lowStockAlert: cleanNumber(body.lowStockAlert),
    },
    { new: true }
  )
    .populate("categoryId", "name")
    .lean();

  if (!updatedProduct) {
    return NextResponse.json(
      { success: false, message: "Product not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Grocery/Product item updated successfully.",
    data: serializeProduct(updatedProduct),
  });
}

async function handleDELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("inventory.manage");
  if (response) return response;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid product ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const deletedProduct = await ProductModel.findOneAndUpdate(
    { _id: id, isActive: true },
    { isActive: false },
    { new: true }
  ).lean();

  if (!deletedProduct) {
    return NextResponse.json(
      { success: false, message: "Product not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Grocery/Product item deleted successfully.",
  });
}

export const PATCH = withAuditLog(handlePATCH, {
  module: "INVENTORY",
  action: "UPDATE",
  entityType: "PRODUCT",
});

export const DELETE = withAuditLog(handleDELETE, {
  module: "INVENTORY",
  action: "DELETE",
  entityType: "PRODUCT",
});
