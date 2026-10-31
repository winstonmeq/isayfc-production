import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId, type QueryFilter } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import {
  cleanNumber,
  cleanString,
  escapeRegex,
  getPagination,
} from "@/lib/crud-utils";
import { correctionReason, recordCorrection } from "@/lib/corrections";
import { manilaDateString } from "@/lib/date-utils";
import { syncDeliverySupplierInvoice } from "@/lib/supplier-invoicing";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import DeliveryModel from "@/models/Delivery";
import DeliveryItemModel from "@/models/DeliveryItem";
import StandardPackingModel from "@/models/StandardPacking";
import SupplierModel from "@/models/Supplier";
import { deliveryProductsById, deliveryProductMatch } from "@/lib/delivery-products";

type DeliveryItemInput = {
  categoryId?: string;
  bodegaProductId?: string;
  productId?: string;
  bags: number;
  kilos: number;
  pieces: number;
  buyingPrice: number;
};

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}

function serializeDelivery(delivery: any) {
  return {
    _id: delivery._id.toString(),
    supplierId: delivery.supplierId?._id?.toString?.() || delivery.supplierId?.toString?.(),
    supplierName: delivery.supplierId?.name || "",
    deliveryCode: delivery.deliveryCode,
    receiptNumber: delivery.receiptNumber,
    totalBags: delivery.totalBags || 0,
    totalKilos: delivery.totalKilos || 0,
    totalPieces: delivery.totalPieces || 0,
    totalAmount: delivery.totalAmount || 0,
    deliveryDate: delivery.deliveryDate
      ? new Date(delivery.deliveryDate).toISOString()
      : undefined,
    remarks: delivery.remarks || "",
    createdAt: delivery.createdAt ? new Date(delivery.createdAt).toISOString() : undefined,
    updatedAt: delivery.updatedAt ? new Date(delivery.updatedAt).toISOString() : undefined,
  };
}

function getStockQtyToAdd(item: { bags: number; kilos: number; pieces: number }) {
  if (item.pieces > 0) return item.pieces;
  if (item.kilos > 0) return item.kilos;
  if (item.bags > 0) return item.bags;
  return 0;
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("supplier-deliveries.view");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const deliveryCode = cleanString(searchParams.get("deliveryCode"));
  const receiptNumber = cleanString(searchParams.get("receiptNumber"));
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));

  const filter: QueryFilter<any> = {
    isVoided: false,
  };

  const productMatch = deliveryProductMatch(searchParams.get("product"));
  if (productMatch) {
    // Apply before pagination/counting, using historical line-item names.
    const deliveryIds = await DeliveryItemModel.distinct("deliveryId", productMatch);
    filter._id = { $in: deliveryIds };
  }

  if (deliveryCode) {
    filter.deliveryCode = {
      $regex: escapeRegex(deliveryCode),
      $options: "i",
    };
  }

  if (receiptNumber) {
    filter.receiptNumber = {
      $regex: escapeRegex(receiptNumber),
      $options: "i",
    };
  }

  if (dateFrom || dateTo) {
    filter.deliveryDate = {};

    if (dateFrom) {
      filter.deliveryDate.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }

    if (dateTo) {
      filter.deliveryDate.$lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
  }

  const [items, total] = await Promise.all([
    DeliveryModel.find(filter)
      .populate("supplierId", "name")
      .sort({ deliveryDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DeliveryModel.countDocuments(filter),
  ]);

  // One batched lookup for the current page, not one request per delivery.
  const lines = items.length ? await DeliveryItemModel.find({ deliveryId: { $in: items.map((item) => item._id) } })
    .select("deliveryId productName").sort({ _id: 1 }).lean() : [];
  const productsByDelivery = deliveryProductsById(lines);

  return NextResponse.json({
    success: true,
    data: items.map((item) => ({ ...serializeDelivery(item), productNames: productsByDelivery.get(String(item._id)) || [] })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

async function handlePOST(req: NextRequest) {
  const { response, session: authSession } = await requirePermission(
    "supplier-deliveries.manage"
  );
  if (response) return response;

  await dbConnect();

  const body = await req.json();
  const supplierId = cleanString(body.supplierId);
  const deliveryCode = cleanString(body.deliveryCode);
  const receiptNumber = cleanString(body.receiptNumber);
  const deliveryDate = cleanString(body.deliveryDate);
  const remarks = cleanString(body.remarks);
  const lateEntryReason = correctionReason(body.correctionReason);
  const effectiveDeliveryDate = deliveryDate || manilaDateString();
  const isLateEntry = effectiveDeliveryDate < manilaDateString();
  const items: DeliveryItemInput[] = Array.isArray(body.items)
    ? body.items
    : Array.isArray(body.deliveryItems)
      ? body.deliveryItems
      : [];

  if (!supplierId || !isValidObjectId(supplierId)) {
    return NextResponse.json(
      { success: false, message: "Valid supplier is required." },
      { status: 400 }
    );
  }

  if (!deliveryCode) {
    return NextResponse.json(
      { success: false, message: "Delivery code is required." },
      { status: 400 }
    );
  }

  if (!receiptNumber) {
    return NextResponse.json(
      { success: false, message: "Receipt number is required." },
      { status: 400 }
    );
  }

  if (isLateEntry && lateEntryReason.length < 5) {
    return NextResponse.json(
      { success: false, message: "A reason of at least 5 characters is required for a backdated delivery." },
      { status: 400 }
    );
  }

  if (items.length === 0) {
    return NextResponse.json(
      { success: false, message: "At least one delivery item is required." },
      { status: 400 }
    );
  }

  const supplierExists = await SupplierModel.exists({
    _id: supplierId,
    isActive: true,
  });

  if (!supplierExists) {
    return NextResponse.json(
      { success: false, message: "Supplier not found." },
      { status: 404 }
    );
  }

  let totalBags = 0;
  let totalKilos = 0;
  let totalPieces = 0;
  let totalAmount = 0;
  const preparedItems: Record<string, any>[] = [];

  for (const item of items) {
    const bodegaProductId = cleanString(item.bodegaProductId || item.productId || "");
    const categoryId = cleanString(item.categoryId || "");

    if (!bodegaProductId || !isValidObjectId(bodegaProductId)) {
      return NextResponse.json(
        { success: false, message: "Invalid bodega product in delivery item." },
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

    const lineTotal = kilos > 0 ? kilos * buyingPrice : pieces * buyingPrice;
    const stockQtyToAdd = getStockQtyToAdd({ bags, kilos, pieces });

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
    let deliveryId: any;

    await mongoSession.withTransaction(async () => {
      const [delivery] = await DeliveryModel.create(
        [
          {
            supplierId,
            deliveryCode,
            receiptNumber,
            totalBags,
            totalKilos,
            totalPieces,
            totalAmount,
            deliveryDate: new Date(effectiveDeliveryDate),
            remarks,
            createdBy: authSession?.user?.id,
          },
        ],
        { session: mongoSession }
      );

      deliveryId = delivery._id;

      const deliveryItemsToInsert = [];
      const bodegaStockTransactions = [];

      for (const item of preparedItems) {
        deliveryItemsToInsert.push({
          deliveryId: delivery._id,
          productId: item.bodegaProductId,
          productName: item.productName,
          bags: item.bags,
          kilos: item.kilos,
          pieces: item.pieces,
          buyingPrice: item.buyingPrice,
          lineTotal: item.lineTotal,
        });

        const updatedProduct = await BodegaProductModel.findOneAndUpdate(
          { _id: item.bodegaProductId, isActive: true },
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
          fail(404, `Bodega product ${item.productName} was not found.`);
        }

        const newStock = Number(updatedProduct.stockQty || 0);
        const previousStock = newStock - item.stockQtyToAdd;

        bodegaStockTransactions.push({
          bodegaProductId: item.bodegaProductId,
          transactionDate: new Date(effectiveDeliveryDate),
          type: "STOCK_IN",
          quantity: item.stockQtyToAdd,
          bags: item.isWholeChicken ? item.bags : 0,
          kilos: item.isWholeChicken ? item.kilos : 0,
          heads: item.isWholeChicken ? item.pieces : 0,
          pieces: item.isWholeChicken ? 0 : item.pieces,
          previousStock,
          newStock,
          remarks: `DELIVERY ${deliveryCode}`,
          referenceType: "DELIVERY",
          referenceId: delivery._id,
          createdBy: authSession?.user?.id,
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
        createdBy: authSession?.user?.id,
        session: mongoSession,
      });

      if (isLateEntry) {
        await recordCorrection({
          entityType: "DELIVERY",
          entityId: delivery._id,
          referenceNumber: deliveryCode,
          correctionType: "LATE_ENTRY",
          reason: lateEntryReason,
          transactionDate: delivery.deliveryDate,
          correctedBy: authSession?.user?.id,
          metadata: { postedAt: new Date().toISOString() },
          session: mongoSession,
        });
      }
    });

    const populatedDelivery = await DeliveryModel.findById(deliveryId)
      .populate("supplierId", "name")
      .lean();

    return NextResponse.json(
      {
        success: true,
        message: "Delivery created successfully.",
        data: serializeDelivery(populatedDelivery),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error(error);
    return NextResponse.json(
      { success: false, message: "Unable to create delivery." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}

export const POST = withAuditLog(handlePOST, {
  module: "SUPPLIER_DELIVERIES",
  action: "CREATE",
  entityType: "DELIVERY",
});
