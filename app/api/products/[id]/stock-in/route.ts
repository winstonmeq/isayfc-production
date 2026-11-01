// app/api/products/[id]/stock-in/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString } from "@/lib/crud-utils";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import ProductModel from "@/models/Product";
import { productQuantityAllowed } from "@/lib/product-units";

async function handlePOST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission(["products.manage", "inventory.manage"]);

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid product ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const body = await req.json();

  const addPcs = cleanNumber(body.stockPcs);
  const addBags = cleanNumber(body.stockBags);
  const addKilos = cleanNumber(body.stockKilos);
  const remarks = cleanString(body.remarks) || "MANUAL STOCK IN";

  if (addPcs <= 0 && addBags <= 0 && addKilos <= 0) {
    return NextResponse.json(
      {
        success: false,
        message: "Enter at least one stock quantity.",
      },
      { status: 400 }
    );
  }

  const product = await ProductModel.findOne({
    _id: id,
    isActive: true,
  });

  if (!product) {
    return NextResponse.json(
      {
        success: false,
        message: "Product not found.",
      },
      { status: 404 }
    );
  }

  if (!(await productQuantityAllowed(product.unitCode, addPcs))) {
    return NextResponse.json({ success: false, message: "Invalid quantity for this product's unit." }, { status: 400 });
  }

  const transactions = [];

  if (addPcs > 0) {
    const previousStock = product.stockPcs;
    product.stockPcs += addPcs;

    transactions.push({
      productId: product._id,
      type: "STOCK_IN",
      unit: "PCS",
      quantity: addPcs,
      previousStock,
      newStock: product.stockPcs,
      remarks,
      referenceType: "MANUAL_PRODUCT_STOCK_IN",
      createdBy: session?.user?.id,
    });
  }

  if (addBags > 0) {
    const previousStock = product.stockBags;
    product.stockBags += addBags;

    transactions.push({
      productId: product._id,
      type: "STOCK_IN",
      unit: "BAGS",
      quantity: addBags,
      previousStock,
      newStock: product.stockBags,
      remarks,
      referenceType: "MANUAL_PRODUCT_STOCK_IN",
      createdBy: session?.user?.id,
    });
  }

  if (addKilos > 0) {
    const previousStock = product.stockKilos;
    product.stockKilos += addKilos;

    transactions.push({
      productId: product._id,
      type: "STOCK_IN",
      unit: "KILOS",
      quantity: addKilos,
      previousStock,
      newStock: product.stockKilos,
      remarks,
      referenceType: "MANUAL_PRODUCT_STOCK_IN",
      createdBy: session?.user?.id,
    });
  }

  await product.save();

  if (transactions.length > 0) {
    await InventoryTransactionModel.insertMany(transactions);
  }

  return NextResponse.json({
    success: true,
    message: "Product stock added successfully.",
    data: {
      _id: product._id.toString(),
      stockPcs: product.stockPcs,
      stockBags: product.stockBags,
      stockKilos: product.stockKilos,
    },
  });
}

export const POST = withAuditLog(handlePOST, {
  module: "PRODUCTS",
  action: "STOCK_IN",
  entityType: "PRODUCT",
});
