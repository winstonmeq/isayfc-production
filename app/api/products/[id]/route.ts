import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString } from "@/lib/crud-utils";
import CategoryModel from "@/models/Category";
import ProductModel from "@/models/Product";
import InventoryTransaction from "@/models/InventoryTransaction";
import { activeProductUnit } from "@/lib/product-units";
import { canChangeProductUnit, validUnitQuantity } from "@/lib/product-unit-policy";

function serializeProduct(product: any) {
  return {
    _id: product._id.toString(),
    name: product.name,
    unitCode: product.unitCode || "PCS",
    categoryId: product.categoryId?._id?.toString?.() || product.categoryId?.toString?.(),
    categoryName: product.categoryId?.name || "",
    buyingPrice: product.buyingPrice || 0,
    unitPrice: product.unitPrice || 0,
    stockPcs: product.stockPcs || 0,
    stockBags: product.stockBags || 0,
    stockKilos: product.stockKilos || 0,
    lowStockAlert: product.lowStockAlert || 0,
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("products.view");
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
  const { response } = await requirePermission("products.manage");
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

  const current = await ProductModel.findOne({ _id: id, isActive: true }).lean();
  if (!current) return NextResponse.json({ success: false, message: "Product not found." }, { status: 404 });
  const unit = await activeProductUnit(body.unitCode ?? current.unitCode);
  if (!unit) return NextResponse.json({ success: false, message: "Select an active unit from Units setup." }, { status: 400 });
  if (!validUnitQuantity(cleanNumber(body.stockPcs), unit.allowsDecimal)) return NextResponse.json({ success: false, message: "Stock quantity does not match the selected unit." }, { status: 400 });
  const history = unit.code !== (current.unitCode || "PCS") && !!await InventoryTransaction.exists({ productId: id });
  if (!canChangeProductUnit(Number(current.stockPcs || current.stockBags || current.stockKilos || 0), history, current.unitCode || "PCS", unit.code)) return NextResponse.json({ success: false, message: "The product unit cannot change after stock or transactions exist. Create a separate product for a different unit." }, { status: 409 });
  const updatedProduct = await ProductModel.findOneAndUpdate(
    { _id: id, isActive: true },
    {
      name,
      unitCode: unit.code,
      categoryId,
      buyingPrice: cleanNumber(body.buyingPrice),
      unitPrice: cleanNumber(body.unitPrice),
      stockPcs: cleanNumber(body.stockPcs),
      stockBags: cleanNumber(body.stockBags),
      stockKilos: cleanNumber(body.stockKilos),
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
    message: "Product updated successfully.",
    data: serializeProduct(updatedProduct),
  });
}

async function handleDELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("products.manage");
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
    message: "Product deleted successfully.",
  });
}

export const PATCH = withAuditLog(handlePATCH, {
  module: "PRODUCTS",
  action: "UPDATE",
  entityType: "PRODUCT",
});

export const DELETE = withAuditLog(handleDELETE, {
  module: "PRODUCTS",
  action: "DELETE",
  entityType: "PRODUCT",
});
