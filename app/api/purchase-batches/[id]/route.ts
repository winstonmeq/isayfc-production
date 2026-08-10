// app/api/purchase-batches/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString } from "@/lib/crud-utils";
import ProductModel from "@/models/Product";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import PurchaseBatchModel from "@/models/PurchaseBatch";
import PurchaseItemModel from "@/models/PurchaseItem";

type PurchaseItemInput = {
  productId: string;
  buyingPrice: number;
  quantity: number;
};

function serializePurchaseBatch(batch: any, items: any[] = []) {
  return {
    _id: batch._id.toString(),

    datePurchased: batch.datePurchased
      ? new Date(batch.datePurchased).toISOString()
      : undefined,

    totalItems: Number(batch.totalItems || 0),
    totalAmount: Number(batch.totalAmount || 0),
    remarks: batch.remarks || "",
    isVoided: Boolean(batch.isVoided),

    items: items.map((item) => ({
      _id: item._id?.toString?.() || "",
      purchaseBatchId: item.purchaseBatchId?.toString?.() || "",

      productId:
        item.productId?._id?.toString?.() || item.productId?.toString?.() || "",

      productName: item.productName || item.productId?.name || "",

      buyingPrice: Number(item.buyingPrice || 0),
      quantity: Number(item.quantity || 0),
      subtotal: Number(item.subtotal || 0),
    })),

    createdAt: batch.createdAt
      ? new Date(batch.createdAt).toISOString()
      : undefined,

    updatedAt: batch.updatedAt
      ? new Date(batch.updatedAt).toISOString()
      : undefined,
  };
}

async function reversePurchaseStock(
  purchaseBatchId: string,
  mongoSession: mongoose.ClientSession,
  transactionDate: Date,
  userId?: string
) {
  const oldItems = await PurchaseItemModel.find({
    purchaseBatchId,
  }).session(mongoSession);

  const inventoryTransactions = [];

  for (const item of oldItems) {
    const productId = cleanString(String((item as any).productId || ""));

    if (!productId || !isValidObjectId(productId)) continue;

    const quantity = Number((item as any).quantity || 0);

    const product = await ProductModel.findOne({
      _id: productId,
      isActive: true,
      stockPcs: { $gte: quantity },
    }).session(mongoSession);

    if (!product) {
      throw new Error(
        `Cannot reverse purchase stock for ${item.productName}. Some of this stock has already been consumed or sold.`
      );
    }

    const previousStock = Number(product.stockPcs || 0);
    const previousCost = Number(product.buyingPrice || 0);
    const purchaseCost = Number((item as any).buyingPrice || 0);
    const newStock = previousStock - quantity;
    const remainingValue = (previousStock * previousCost) - (quantity * purchaseCost);

    product.stockPcs = newStock;
    product.buyingPrice = newStock > 0
      ? Math.max(0, Math.round((remainingValue / newStock) * 10000) / 10000)
      : 0;
    await product.save({ session: mongoSession });

    inventoryTransactions.push({
      productId: product._id,
      transactionDate,
      type: "VOID_REVERSAL",
      unit: "PCS",
      quantity,
      previousStock,
      newStock,
      remarks: `PURCHASE BATCH ${purchaseBatchId} REVERSAL`,
      referenceType: "PURCHASE_BATCH_VOID",
      referenceId: purchaseBatchId,
      createdBy: userId,
    });
  }

  if (inventoryTransactions.length > 0) {
    await InventoryTransactionModel.insertMany(inventoryTransactions, {
      session: mongoSession,
    });
  }
}

async function preparePurchaseItems(items: PurchaseItemInput[]) {
  let totalItems = 0;
  let totalAmount = 0;

  const preparedItems = [];

  for (const item of items) {
    const productId = cleanString(item.productId);

    if (!productId || !isValidObjectId(productId)) {
      return {
        error: NextResponse.json(
          {
            success: false,
            message: "Invalid product in purchase item.",
          },
          { status: 400 }
        ),
      };
    }

    const product = await ProductModel.findOne({
      _id: productId,
      isActive: true,
    });

    if (!product) {
      return {
        error: NextResponse.json(
          {
            success: false,
            message: "One selected product was not found.",
          },
          { status: 404 }
        ),
      };
    }

    const buyingPrice = cleanNumber(item.buyingPrice);
    const quantity = cleanNumber(item.quantity);

    if (buyingPrice <= 0) {
      return {
        error: NextResponse.json(
          {
            success: false,
            message: `Buying price must be greater than zero for ${product.name}.`,
          },
          { status: 400 }
        ),
      };
    }

    if (quantity <= 0) {
      return {
        error: NextResponse.json(
          {
            success: false,
            message: `Quantity must be greater than zero for ${product.name}.`,
          },
          { status: 400 }
        ),
      };
    }

    const subtotal = buyingPrice * quantity;

    totalItems += quantity;
    totalAmount += subtotal;

    preparedItems.push({
      product,
      productId: product._id,
      productName: product.name,
      buyingPrice,
      quantity,
      subtotal,
    });
  }

  return {
    totalItems,
    totalAmount,
    preparedItems,
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission(["purchase-items.view", "purchase-items.manage"]);

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid purchase batch ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const batch = await PurchaseBatchModel.findOne({
    _id: id,
    isVoided: false,
  }).lean();

  if (!batch) {
    return NextResponse.json(
      {
        success: false,
        message: "Purchase batch not found.",
      },
      { status: 404 }
    );
  }

  const items = await PurchaseItemModel.find({
    purchaseBatchId: id,
  })
    .populate("productId", "name")
    .sort({ createdAt: 1 })
    .lean();

  return NextResponse.json({
    success: true,
    data: serializePurchaseBatch(batch, items),
  });
}

async function handlePATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission("purchase-items.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid purchase batch ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const batch = await PurchaseBatchModel.findOne({
    _id: id,
    isVoided: false,
  });

  if (!batch) {
    return NextResponse.json(
      {
        success: false,
        message: "Purchase batch not found.",
      },
      { status: 404 }
    );
  }

  const body = await req.json();

  const datePurchased = cleanString(body.datePurchased);
  const remarks = cleanString(body.remarks);

  const items: PurchaseItemInput[] = Array.isArray(body.items)
    ? body.items
    : [];

  if (!datePurchased) {
    return NextResponse.json(
      {
        success: false,
        message: "Date purchased is required.",
      },
      { status: 400 }
    );
  }

  if (items.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message: "At least one purchase item is required.",
      },
      { status: 400 }
    );
  }

  const prepared = await preparePurchaseItems(items);

  if ("error" in prepared && prepared.error) {
    return prepared.error;
  }

  const transactionDate = new Date(datePurchased);
  const mongoSession = await mongoose.startSession();

  try {
    await mongoSession.withTransaction(async () => {
      await reversePurchaseStock(
        id,
        mongoSession,
        transactionDate,
        session?.user?.id
      );

      await PurchaseItemModel.deleteMany({ purchaseBatchId: id }).session(mongoSession);

      batch.datePurchased = transactionDate;
      batch.totalItems = prepared.totalItems || 0;
      batch.totalAmount = prepared.totalAmount || 0;
      batch.remarks = remarks;
      await batch.save({ session: mongoSession });

      const purchaseItemsToInsert = [];
      const inventoryTransactions = [];

      for (const item of prepared.preparedItems || []) {
        const product = await ProductModel.findOne({
          _id: item.productId,
          isActive: true,
        }).session(mongoSession);
        if (!product) throw new Error(`Product ${item.productName} is no longer available.`);

        const previousStock = Number(product.stockPcs || 0);
        const previousCost = Number(product.buyingPrice || 0);
        const newStock = previousStock + item.quantity;
        const weightedCost = newStock > 0
          ? ((previousStock * previousCost) + (item.quantity * item.buyingPrice)) / newStock
          : item.buyingPrice;

        product.stockPcs = newStock;
        product.buyingPrice = Math.round(weightedCost * 10000) / 10000;
        await product.save({ session: mongoSession });

        purchaseItemsToInsert.push({
          purchaseBatchId: batch._id,
          productId: item.productId,
          productName: item.productName,
          buyingPrice: item.buyingPrice,
          quantity: item.quantity,
          subtotal: item.subtotal,
        });
        inventoryTransactions.push({
          productId: item.productId,
          transactionDate,
          type: "STOCK_IN",
          unit: "PCS",
          quantity: item.quantity,
          previousStock,
          newStock,
          remarks: `PURCHASE BATCH ${batch._id} UPDATED`,
          referenceType: "PURCHASE_BATCH",
          referenceId: batch._id,
          createdBy: session?.user?.id,
        });
      }

      await PurchaseItemModel.insertMany(purchaseItemsToInsert, { session: mongoSession });
      await InventoryTransactionModel.insertMany(inventoryTransactions, { session: mongoSession });
    });
  } finally {
    await mongoSession.endSession();
  }

  const updatedItems = await PurchaseItemModel.find({
    purchaseBatchId: batch._id,
  })
    .populate("productId", "name")
    .sort({ createdAt: 1 })
    .lean();

  return NextResponse.json({
    success: true,
    message: "Purchase batch updated successfully.",
    data: serializePurchaseBatch(batch.toObject(), updatedItems),
  });
}

async function handleDELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission("purchase-items.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid purchase batch ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const batch = await PurchaseBatchModel.findOne({
    _id: id,
    isVoided: false,
  });

  if (!batch) {
    return NextResponse.json(
      {
        success: false,
        message: "Purchase batch not found.",
      },
      { status: 404 }
    );
  }

  const mongoSession = await mongoose.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      await reversePurchaseStock(
        id,
        mongoSession,
        new Date(),
        session?.user?.id
      );
      batch.isVoided = true;
      await batch.save({ session: mongoSession });
    });
  } finally {
    await mongoSession.endSession();
  }

  return NextResponse.json({
    success: true,
    message: "Purchase batch voided successfully and product stock was reversed.",
  });
}

export const PATCH = withAuditLog(handlePATCH, {
  module: "PURCHASE_ITEMS",
  action: "UPDATE",
  entityType: "PURCHASE_BATCH",
});

export const DELETE = withAuditLog(handleDELETE, {
  module: "PURCHASE_ITEMS",
  action: "DELETE",
  entityType: "PURCHASE_BATCH",
});
