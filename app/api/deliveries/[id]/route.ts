// app/api/deliveries/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString } from "@/lib/crud-utils";
import {
  syncDeliverySupplierInvoice,
  voidDeliverySupplierInvoice,
} from "@/lib/supplier-invoicing";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import DeliveryModel from "@/models/Delivery";
import DeliveryItemModel from "@/models/DeliveryItem";
import StandardPackingModel from "@/models/StandardPacking";
import SupplierModel from "@/models/Supplier";
import {
  correctionReason,
  recordCorrection,
} from "@/lib/corrections";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}

type DeliveryItemInput = {
  categoryId?: string;
  bodegaProductId?: string;
  productId?: string;
  bags: number;
  kilos: number;
  pieces: number;
  buyingPrice: number;
};

function getStockQty(item: {
  bags: number;
  kilos: number;
  pieces: number;
}) {
  if (item.pieces > 0) return item.pieces;
  if (item.kilos > 0) return item.kilos;
  if (item.bags > 0) return item.bags;

  return 0;
}

function getLineTotal(item: {
  kilos: number;
  pieces: number;
  buyingPrice: number;
}) {
  if (item.kilos > 0) return item.kilos * item.buyingPrice;
  return item.pieces * item.buyingPrice;
}

function serializeDelivery(delivery: any, lines: any[] = []) {
  return {
    _id: delivery._id.toString(),

    supplierId:
      delivery.supplierId?._id?.toString?.() ||
      delivery.supplierId?.toString?.(),
    supplierName: delivery.supplierId?.name || "",

    deliveryCode: delivery.deliveryCode,
    receiptNumber: delivery.receiptNumber,

    totalBags: Number(delivery.totalBags || 0),
    totalKilos: Number(delivery.totalKilos || 0),
    totalPieces: Number(delivery.totalPieces || 0),
    totalAmount: Number(delivery.totalAmount || 0),

    deliveryDate: delivery.deliveryDate
      ? new Date(delivery.deliveryDate).toISOString()
      : undefined,

    remarks: delivery.remarks || "",

    items: lines.map((line) => ({
      _id: line._id?.toString?.() || "",
      deliveryId: line.deliveryId?.toString?.() || "",

      productId:
        line.productId?._id?.toString?.() ||
        line.productId?.toString?.() ||
        line.bodegaProductId?.toString?.() ||
        "",

      bodegaProductId:
        line.bodegaProductId?.toString?.() ||
        line.productId?.toString?.() ||
        "",

      categoryId: line.categoryId?.toString?.() || "",

      productName:
        line.productName ||
        line.bodegaProductName ||
        line.productId?.name ||
        "",

      bags: Number(line.bags || 0),
      kilos: Number(line.kilos || 0),
      pieces: Number(line.pieces || 0),
      buyingPrice: Number(line.buyingPrice || 0),
      lineTotal: Number(line.lineTotal || line.totalAmount || 0),
      totalAmount: Number(line.lineTotal || line.totalAmount || 0),
    })),
  };
}

async function reverseDeliveryStock({
  deliveryId,
  deliveryCode,
  createdBy,
  mongoSession,
}: {
  deliveryId: string;
  deliveryCode: string;
  createdBy?: string;
  mongoSession: mongoose.ClientSession;
}) {
  const oldItems = await DeliveryItemModel.find({ deliveryId }).session(
    mongoSession
  );

  const transactions = [];

  for (const item of oldItems) {
    const bodegaProductId = cleanString(
      String((item as any).bodegaProductId || (item as any).productId || "")
    );

    if (!bodegaProductId || !isValidObjectId(bodegaProductId)) continue;

    const stockQtyToReverse = getStockQty({
      bags: Number((item as any).bags || 0),
      kilos: Number((item as any).kilos || 0),
      pieces: Number((item as any).pieces || 0),
    });

    if (stockQtyToReverse <= 0) continue;

    // Conditional $gte guard: refuse to reverse stock that was already
    // consumed (sliced/sold), instead of silently clamping to zero and
    // corrupting the stock ledger.
    const isWholeChicken = Boolean(
      await StandardPackingModel.exists({
        wholeChickenId: bodegaProductId,
        isActive: true,
      }).session(mongoSession)
    );
    const bags = isWholeChicken ? Number((item as any).bags || 0) : 0;
    const kilos = isWholeChicken ? Number((item as any).kilos || 0) : 0;
    const heads = isWholeChicken ? Number((item as any).pieces || 0) : 0;
    const balanceFilter: Record<string, any> = {
      _id: bodegaProductId,
      stockQty: { $gte: stockQtyToReverse },
    };
    if (bags > 0) balanceFilter.stockBags = { $gte: bags };
    if (kilos > 0) balanceFilter.stockKilos = { $gte: kilos };
    if (heads > 0) balanceFilter.stockHeads = { $gte: heads };

    const product = await BodegaProductModel.findOneAndUpdate(
      balanceFilter,
      {
        $inc: {
          stockQty: -stockQtyToReverse,
          stockBags: -bags,
          stockKilos: -kilos,
          stockHeads: -heads,
        },
      },
      { new: true, session: mongoSession }
    );

    if (!product) {
      const current = await BodegaProductModel.findById(bodegaProductId)
        .select("name stockQty")
        .session(mongoSession)
        .lean();

      if (!current) continue;

      const available = Number((current as any).stockQty ?? 0);
      const name = String((current as any).name || "This product");

      fail(
        400,
        `Cannot reverse delivery ${deliveryCode}: ${name} only has ${available} in stock but this delivery added ${stockQtyToReverse}. Some stock was already used (sliced or sold). Void or adjust those records first.`
      );
    }

    const newStock = Number(product.stockQty || 0);

    transactions.push({
      bodegaProductId: product._id,
      type: "VOID_REVERSAL",
      quantity: stockQtyToReverse,
      bags,
      kilos,
      heads,
      pieces: isWholeChicken ? 0 : Number((item as any).pieces || 0),
      previousStock: newStock + stockQtyToReverse,
      newStock,
      remarks: `VOID DELIVERY ${deliveryCode}`,
      referenceType: "DELIVERY_VOID",
      referenceId: deliveryId,
      createdBy,
    });
  }

  if (transactions.length > 0) {
    await BodegaStockTransactionModel.insertMany(transactions, {
      session: mongoSession,
    });
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission(["supplier-deliveries.view", "supplier-deliveries.manage"]);

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid delivery ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const delivery = await DeliveryModel.findOne({
    _id: id,
    isVoided: false,
  })
    .populate("supplierId", "name")
    .lean();

  if (!delivery) {
    return NextResponse.json(
      {
        success: false,
        message: "Delivery not found.",
      },
      { status: 404 }
    );
  }

  const lines = await DeliveryItemModel.find({
    deliveryId: id,
  }).lean();

  return NextResponse.json({
    success: true,
    data: serializeDelivery(delivery, lines),
  });
}

async function handlePATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission("supplier-deliveries.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid delivery ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const delivery = await DeliveryModel.findOne({
    _id: id,
    isVoided: false,
  });

  if (!delivery) {
    return NextResponse.json(
      {
        success: false,
        message: "Delivery not found.",
      },
      { status: 404 }
    );
  }

  const body = await req.json();
  const reason = correctionReason(body.correctionReason);
  if (reason.length < 5) {
    return NextResponse.json(
      { success: false, message: "A correction reason of at least 5 characters is required when editing a posted delivery." },
      { status: 400 }
    );
  }

  const supplierId = cleanString(body.supplierId);
  const deliveryCode = cleanString(body.deliveryCode);
  const receiptNumber = cleanString(body.receiptNumber);
  const deliveryDate = cleanString(body.deliveryDate);
  const remarks = cleanString(body.remarks);

  const items: DeliveryItemInput[] = Array.isArray(body.items)
    ? body.items
    : Array.isArray(body.deliveryItems)
      ? body.deliveryItems
      : [];

  if (!supplierId || !isValidObjectId(supplierId)) {
    return NextResponse.json(
      {
        success: false,
        message: "Valid supplier is required.",
      },
      { status: 400 }
    );
  }

  if (!deliveryCode) {
    return NextResponse.json(
      {
        success: false,
        message: "Delivery code is required.",
      },
      { status: 400 }
    );
  }

  if (!receiptNumber) {
    return NextResponse.json(
      {
        success: false,
        message: "Receipt number is required.",
      },
      { status: 400 }
    );
  }

  if (items.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message: "At least one delivery item is required.",
      },
      { status: 400 }
    );
  }

  const supplierExists = await SupplierModel.exists({
    _id: supplierId,
    isActive: true,
  });

  if (!supplierExists) {
    return NextResponse.json(
      {
        success: false,
        message: "Supplier not found.",
      },
      { status: 404 }
    );
  }

  let totalBags = 0;
  let totalKilos = 0;
  let totalPieces = 0;
  let totalAmount = 0;

  type PreparedDeliveryItem = {
    categoryId: string;
    bodegaProductId: mongoose.Types.ObjectId;
    productName: string;
    bags: number;
    kilos: number;
    pieces: number;
    buyingPrice: number;
    lineTotal: number;
    stockQtyToAdd: number;
    isWholeChicken: boolean;
  };

  const preparedItems: PreparedDeliveryItem[] = [];

  for (const item of items) {
    const bodegaProductId = cleanString(
      item.bodegaProductId || item.productId || ""
    );

    const categoryId = cleanString(item.categoryId || "");

    if (!bodegaProductId || !isValidObjectId(bodegaProductId)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid bodega product in delivery item.",
        },
        { status: 400 }
      );
    }

    const product = await BodegaProductModel.findOne({
      _id: bodegaProductId,
      isActive: true,
    });

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          message: "One of the selected bodega products was not found.",
        },
        { status: 404 }
      );
    }

    const bags = cleanNumber(item.bags);
    const kilos = cleanNumber(item.kilos);
    const pieces = cleanNumber(item.pieces);
    const buyingPrice = cleanNumber(item.buyingPrice);
    const isWholeChicken = Boolean(
      await StandardPackingModel.exists({
        wholeChickenId: product._id,
        isActive: true,
      })
    );

    if (
      (isWholeChicken && (bags <= 0 || kilos <= 0 || pieces <= 0)) ||
      (!isWholeChicken && pieces <= 0)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: isWholeChicken
            ? `Enter bags, kilos, and heads for ${product.name}.`
            : `Enter pieces for ${product.name}.`,
        },
        { status: 400 }
      );
    }

    const lineTotal = getLineTotal({
      kilos,
      pieces,
      buyingPrice,
    });

    const stockQtyToAdd = getStockQty({
      bags,
      kilos,
      pieces,
    });

    totalBags += bags;
    totalKilos += kilos;
    totalPieces += pieces;
    totalAmount += lineTotal;

    preparedItems.push({
      categoryId,
      bodegaProductId: product._id,
      productName: product.name,
      bags,
      kilos,
      pieces,
      buyingPrice,
      lineTotal,
      stockQtyToAdd,
      isWholeChicken,
    });
  }

  const mongoSession = await mongoose.startSession();

  try {
    await mongoSession.withTransaction(async () => {
      // Reverse the old delivery's stock first (fails cleanly if stock was
      // already consumed), then re-apply the edited items atomically.
      await reverseDeliveryStock({
        deliveryId: id,
        deliveryCode: delivery.deliveryCode,
        createdBy: session?.user?.id,
        mongoSession,
      });

      await DeliveryItemModel.deleteMany({ deliveryId: id }, { session: mongoSession });

      delivery.supplierId = supplierId as any;
      delivery.deliveryCode = deliveryCode;
      delivery.receiptNumber = receiptNumber;
      delivery.totalBags = totalBags;
      delivery.totalKilos = totalKilos;
      delivery.totalPieces = totalPieces;
      delivery.totalAmount = totalAmount;
      delivery.deliveryDate = deliveryDate ? new Date(deliveryDate) : new Date();
      delivery.remarks = remarks;

      await delivery.save({ session: mongoSession });

      const deliveryItemsToInsert = [];
      const bodegaStockTransactions = [];

      for (const item of preparedItems) {
        deliveryItemsToInsert.push({
          deliveryId: delivery._id,

          productId: item.bodegaProductId,
          bodegaProductId: item.bodegaProductId,
          categoryId: item.categoryId,

          productName: item.productName,
          bags: item.bags,
          kilos: item.kilos,
          pieces: item.pieces,
          buyingPrice: item.buyingPrice,
          lineTotal: item.lineTotal,
        });

        const updatedProduct = await BodegaProductModel.findOneAndUpdate(
          { _id: item.bodegaProductId },
          {
            $inc: {
              stockQty: item.stockQtyToAdd,
              stockBags: item.isWholeChicken ? item.bags : 0,
              stockKilos: item.isWholeChicken ? item.kilos : 0,
              stockHeads: item.isWholeChicken ? item.pieces : 0,
            },
            $set: { buyingPrice: item.buyingPrice },
          },
          { new: true, session: mongoSession }
        );

        if (!updatedProduct) {
          fail(404, `${item.productName} was not found.`);
        }

        const newStock = Number(updatedProduct.stockQty || 0);

        bodegaStockTransactions.push({
          bodegaProductId: updatedProduct._id,
          transactionDate: delivery.deliveryDate,
          type: "STOCK_IN",
          quantity: item.stockQtyToAdd,
          bags: item.isWholeChicken ? item.bags : 0,
          kilos: item.isWholeChicken ? item.kilos : 0,
          heads: item.isWholeChicken ? item.pieces : 0,
          pieces: item.isWholeChicken ? 0 : item.pieces,
          previousStock: newStock - item.stockQtyToAdd,
          newStock,
          remarks: `EDIT DELIVERY ${deliveryCode}`,
          referenceType: "DELIVERY",
          referenceId: delivery._id,
          createdBy: session?.user?.id,
        });
      }

      await DeliveryItemModel.insertMany(deliveryItemsToInsert, {
        session: mongoSession,
      });

      if (bodegaStockTransactions.length > 0) {
        await BodegaStockTransactionModel.insertMany(bodegaStockTransactions, {
          session: mongoSession,
        });
      }

      await syncDeliverySupplierInvoice({
        deliveryId: delivery._id,
        supplierId: delivery.supplierId,
        receiptNumber: delivery.receiptNumber,
        deliveryCode: delivery.deliveryCode,
        deliveryDate: delivery.deliveryDate,
        totalAmount: delivery.totalAmount,
        createdBy: session?.user?.id,
        session: mongoSession,
      });

      await recordCorrection({
        entityType: "DELIVERY",
        entityId: delivery._id,
        referenceNumber: delivery.deliveryCode,
        correctionType: "ADJUSTMENT",
        reason,
        transactionDate: delivery.deliveryDate,
        correctedBy: session?.user?.id,
        metadata: {
          totalAmount,
          totalItems: preparedItems.length,
        },
        session: mongoSession,
      });
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error(error);

    return NextResponse.json(
      { success: false, message: "Unable to update delivery." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }

  const populatedDelivery = await DeliveryModel.findById(delivery._id)
    .populate("supplierId", "name")
    .lean();

  const lines = await DeliveryItemModel.find({
    deliveryId: delivery._id,
  }).lean();

  return NextResponse.json({
    success: true,
    message: "Delivery updated successfully.",
    data: serializeDelivery(populatedDelivery, lines),
  });
}

async function handleDELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission("supplier-deliveries.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid delivery ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const body = await req.json().catch(() => ({}));
  const reason = correctionReason(body?.reason);
  if (reason.length < 5) {
    return NextResponse.json(
      { success: false, message: "A correction reason of at least 5 characters is required." },
      { status: 400 }
    );
  }

  const delivery = await DeliveryModel.findOne({
    _id: id,
    isVoided: false,
  });

  if (!delivery) {
    return NextResponse.json(
      {
        success: false,
        message: "Delivery not found.",
      },
      { status: 404 }
    );
  }

  const mongoSession = await mongoose.startSession();

  try {
    await mongoSession.withTransaction(async () => {
      // Atomically claim the delivery so two simultaneous voids cannot both run.
      const claimed = await DeliveryModel.findOneAndUpdate(
        { _id: id, isVoided: false },
        { $set: { isVoided: true } },
        { new: true, session: mongoSession }
      );

      if (!claimed) {
        fail(404, "Delivery not found.");
      }

      await voidDeliverySupplierInvoice(claimed._id, mongoSession);

      await reverseDeliveryStock({
        deliveryId: id,
        deliveryCode: claimed.deliveryCode,
        createdBy: session?.user?.id,
        mongoSession,
      });

      await recordCorrection({
        entityType: "DELIVERY",
        entityId: claimed._id,
        referenceNumber: claimed.deliveryCode,
        correctionType: "VOID",
        reason,
        transactionDate: claimed.deliveryDate,
        correctedBy: session?.user?.id,
        metadata: { totalAmount: Number(claimed.totalAmount || 0) },
        session: mongoSession,
      });
    });

    return NextResponse.json({
      success: true,
      message: "Delivery voided successfully and bodega stock was reversed.",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error(error);

    return NextResponse.json(
      { success: false, message: "Unable to void delivery." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}

export const PATCH = withAuditLog(handlePATCH, {
  module: "SUPPLIER_DELIVERIES",
  action: "UPDATE",
  entityType: "DELIVERY",
});

export const DELETE = withAuditLog(handleDELETE, {
  module: "SUPPLIER_DELIVERIES",
  action: "VOID",
  entityType: "DELIVERY",
});
