// app/api/categories/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanString, serializeDocument } from "@/lib/crud-utils";
import CategoryModel from "@/models/Category";
import { isCategorySource, categorySource, categorySourceLabel, categoryMatchesSource } from "@/lib/category-source";
import Product from "@/models/Product";
import BodegaProduct from "@/models/BodegaProduct";
import { isInventorySourceCategory, PRODUCT_CATEGORY_ERROR } from "@/lib/product-classification";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission(["categories.view", "categories.manage"]);

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid category ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const category = await CategoryModel.findOne({
    _id: id,
    isActive: true,
  }).lean();

  if (!category) {
    return NextResponse.json(
      {
        success: false,
        message: "Category not found.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { ...serializeDocument(category), source: isCategorySource(category.source) ? category.source : "", sourceLabel: categorySourceLabel(category.source) },
  });
}

async function handlePATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("categories.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid category ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const body = await req.json();
  if (body.source !== undefined) {
    if (!isCategorySource(body.source)) return NextResponse.json({ success: false, message: "Select a valid category source." }, { status: 400 });
    const [grocery, bodega] = await Promise.all([
      categoryMatchesSource(body.source, "GROCERY") ? null : Product.exists({ categoryId: id, isActive: true }),
      categoryMatchesSource(body.source, "BODEGA") ? null : BodegaProduct.exists({ categoryId: id, isActive: true }),
    ]);
    if (grocery || bodega) return NextResponse.json({ success: false, message: "This category is assigned to products from another source. Keep it Shared or reassign those products first." }, { status: 409 });
  }

  const name = cleanString(body.name);
  const currentCategory = await CategoryModel.findOne({ _id: id, isActive: true }).select("name").lean();
  if (!currentCategory) return NextResponse.json({ success: false, message: "Category not found." }, { status: 404 });
  if (isInventorySourceCategory(name) && name.toUpperCase() !== currentCategory.name.toUpperCase()) return NextResponse.json({ success: false, message: PRODUCT_CATEGORY_ERROR }, { status: 400 });
  const description = cleanString(body.description);

  if (!name) {
    return NextResponse.json(
      {
        success: false,
        message: "Category name is required.",
      },
      { status: 400 }
    );
  }

  const updatedCategory = await CategoryModel.findOneAndUpdate(
    {
      _id: id,
      isActive: true,
    },
    {
      name,
      description,
      ...(body.source !== undefined ? { source: categorySource(body.source) } : {}),
    },
    {
      new: true,
      runValidators: true,
    }
  ).lean();

  if (!updatedCategory) {
    return NextResponse.json(
      {
        success: false,
        message: "Category not found.",
      },
      { status: 404 }
    );
  }

  if ((body.source !== undefined && updatedCategory.source !== body.source)) {
    return NextResponse.json({ success: false, message: "Category classification was not saved. Restart the application server and retry." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: "Category updated successfully.",
    data: { ...serializeDocument(updatedCategory), source: categorySource(updatedCategory.source), sourceLabel: categorySourceLabel(updatedCategory.source) },
  });
}

async function handleDELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("categories.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid category ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const deletedCategory = await CategoryModel.findOneAndUpdate(
    {
      _id: id,
      isActive: true,
    },
    {
      isActive: false,
    },
    {
      new: true,
    }
  ).lean();

  if (!deletedCategory) {
    return NextResponse.json(
      {
        success: false,
        message: "Category not found.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Category deleted successfully.",
  });
}

export const PATCH = withAuditLog(handlePATCH, {
  module: "CATEGORIES",
  action: "UPDATE",
  entityType: "CATEGORY",
});

export const DELETE = withAuditLog(handleDELETE, {
  module: "CATEGORIES",
  action: "DELETE",
  entityType: "CATEGORY",
});
