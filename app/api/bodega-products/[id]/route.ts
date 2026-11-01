// app/api/bodega-products/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString } from "@/lib/crud-utils";
import BodegaProductModel from "@/models/BodegaProduct";
import CategoryModel from "@/models/Category";
import BodegaStockTransaction from "@/models/BodegaStockTransaction";
import StandardPacking from "@/models/StandardPacking";
import { activeProductUnit } from "@/lib/product-units";
import { canChangeProductUnit } from "@/lib/product-unit-policy";

function serializeBodegaProduct(product: any) {
  return {
    _id: product._id.toString(),
    name: product.name,
    unitCode: product.unitCode || "HEAD",
    categoryId: product.categoryId?._id?.toString?.() || product.categoryId?.toString?.() || "",
    categoryName: product.categoryId?.name || "",
    stockQty: product.stockQty || 0,
    buyingPrice: product.buyingPrice || 0,
    sellingPrice: product.sellingPrice || 0,
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission(["bodega-products.view", "bodega-products.manage"]);

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid bodega product ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const product = await BodegaProductModel.findOne({
    _id: id,
    isActive: true,
  })
    .populate("categoryId", "name")
    .lean();

  if (!product) {
    return NextResponse.json(
      {
        success: false,
        message: "Bodega product not found.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: serializeBodegaProduct(product),
  });
}

async function handlePATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("bodega-products.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid bodega product ID.",
      },
      { status: 400 }
    );
  }

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
      _id: categoryId,
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

  const current = await BodegaProductModel.findOne({ _id: id, isActive: true }).lean();
  if (!current) return NextResponse.json({ success: false, message: "Product not found." }, { status: 404 });
  const packed = !!await StandardPacking.exists({ productId: id, isActive: true, standardPacking: { $gt: 0 } });
  const oldCode = packed ? "PACK" : current.unitCode || "HEAD";
  const unit = await activeProductUnit(body.unitCode ?? oldCode, "HEAD");
  if (!unit || (packed ? unit.code !== "PACK" : !["HEAD", "PCS"].includes(unit.code))) return NextResponse.json({ success: false, message: "Bodega stock uses HEAD or PCS; PACK is managed through Standard PCS & Packs." }, { status: 400 });
  const history = unit.code !== oldCode && !!await BodegaStockTransaction.exists({ bodegaProductId: id });
  if (!canChangeProductUnit(Number(current.stockQty || current.stockHeads || current.stockKilos || 0), history, oldCode, unit.code)) return NextResponse.json({ success: false, message: "Cannot change units after stock or transactions exist. Create a separate product instead." }, { status: 409 });
  const updatedProduct = await BodegaProductModel.findOneAndUpdate(
    {
      _id: id,
      isActive: true,
    },
    {
      name,
      unitCode: unit.code,
      categoryId: categoryId || undefined,
      buyingPrice: cleanNumber(body.buyingPrice),
      sellingPrice: cleanNumber(body.sellingPrice),
    },
    {
      new: true,
    }
  )
    .populate("categoryId", "name")
    .lean();

  if (!updatedProduct) {
    return NextResponse.json(
      {
        success: false,
        message: "Bodega product not found.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Bodega product updated successfully.",
    data: serializeBodegaProduct(updatedProduct),
  });
}

async function handleDELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("bodega-products.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid bodega product ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const deletedProduct = await BodegaProductModel.findOneAndUpdate(
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

  if (!deletedProduct) {
    return NextResponse.json(
      {
        success: false,
        message: "Bodega product not found.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Bodega product deleted successfully.",
  });
}

export const PATCH = withAuditLog(handlePATCH, {
  module: "BODEGA_PRODUCTS",
  action: "UPDATE",
  entityType: "BODEGA_PRODUCT",
});

export const DELETE = withAuditLog(handleDELETE, {
  module: "BODEGA_PRODUCTS",
  action: "DELETE",
  entityType: "BODEGA_PRODUCT",
});
