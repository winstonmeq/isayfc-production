import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import {
  cleanNumber,
  cleanString,
  escapeRegex,
  getPagination,
} from "@/lib/crud-utils";
import {
  cleanDeliveryCategory,
  cleanDeliveryStatus,
  cleanItemSource,
  getCategoryId,
  getCategoryName,
  roundMoney,
  serializeCustomerDelivery,
  serializeCustomerDeliveryItem,
  wholeNumber,
} from "@/lib/customer-delivery-utils";
import BodegaProductModel from "@/models/BodegaProduct";
import CategoryModel from "@/models/Category";
import CustomerModel from "@/models/Customer";
import OutletModel from "@/models/Outlet";
import CustomerDeliveryModel from "@/models/CustomerDelivery";
import CustomerDeliveryItemModel from "@/models/CustomerDeliveryItem";
import ProductModel from "@/models/Product";
import StandardPackingModel from "@/models/StandardPacking";

type CustomerDeliveryItemInput = {
  source?: string;
  productId?: string;
  bodegaProductId?: string;
  qty?: number;
  quantity?: number;
  packs?: number;
  remarks?: string;
};

type PreparedItem = {
  source: "BODEGA" | "GROCERY";
  productId?: mongoose.Types.ObjectId;
  bodegaProductId?: mongoose.Types.ObjectId;
  categoryId?: mongoose.Types.ObjectId;
  categoryName: string;
  productName: string;
  qty: number;
  price: number;
  lineTotal: number;
  stockUnit: "PACK" | "QTY";
  packSize: number;
  stockPcsOut: number;
  remarks: string;
};

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}

function toDate(value: string, endOfDay = false) {
  if (!value) return null;
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getPackSizeForBodegaProduct(bodegaProductId: string) {
  const standard = await StandardPackingModel.findOne({
    isActive: true,
    productId: bodegaProductId,
  })
    .select("standardPacking")
    .lean();

  return wholeNumber(standard?.standardPacking);
}

async function prepareCustomerDeliveryItems(items: CustomerDeliveryItemInput[]) {
  const preparedItems: PreparedItem[] = [];
  let totalQty = 0;
  let totalAmount = 0;

  for (const item of items) {
    const source = cleanItemSource(item.source);
    const qty = cleanNumber(item.quantity || item.packs || item.qty);
    const remarks = cleanString(item.remarks);

    if (qty <= 0) {
      fail(400, "Each delivery item quantity must be greater than zero.");
    }

    if (source === "BODEGA") {
      const bodegaProductId = cleanString(item.bodegaProductId || item.productId || "");

      if (!bodegaProductId || !isValidObjectId(bodegaProductId)) {
        fail(400, "Invalid bodega product in customer delivery item.");
      }

      const product = await BodegaProductModel.findOne({
        _id: bodegaProductId,
        isActive: true,
      })
        .populate("categoryId", "name")
        .lean();

      if (!product) {
        fail(404, "One selected bodega product was not found.");
      }

      const packSize = await getPackSizeForBodegaProduct(bodegaProductId);
      const stockUnit: "PACK" | "QTY" = packSize > 0 ? "PACK" : "QTY";
      const stockPcsOut = packSize > 0 ? qty * packSize : qty;
      const availableStock = Number(product.stockQty || 0);
      const price = Number(product.sellingPrice || 0);

      if (price <= 0) {
        fail(400, `Selling price is not set for ${product.name}.`);
      }

      if (availableStock < stockPcsOut) {
        fail(400, `Not enough stock for ${product.name}. Available: ${availableStock}.`);
      }

      const lineTotal = roundMoney(qty * price);
      totalQty += stockPcsOut;
      totalAmount = roundMoney(totalAmount + lineTotal);

      preparedItems.push({
        source,
        bodegaProductId: product._id,
        categoryId: getCategoryId(product),
        categoryName: getCategoryName(product),
        productName: product.name,
        qty,
        price,
        lineTotal,
        stockUnit,
        packSize,
        stockPcsOut,
        remarks,
      });
    }

    if (source === "GROCERY") {
      const productId = cleanString(item.productId || "");

      if (!productId || !isValidObjectId(productId)) {
        fail(400, "Invalid grocery/product item in customer delivery item.");
      }

      const product = await ProductModel.findOne({ _id: productId, isActive: true })
        .populate("categoryId", "name")
        .lean();

      if (!product) {
        fail(404, "One selected grocery/product item was not found.");
      }

      const availableStock = Number(product.stockPcs || 0);
      const price = Number(product.unitPrice || 0);
      const stockPcsOut = qty;

      if (price <= 0) {
        fail(400, `Unit price is not set for ${product.name}.`);
      }

      if (availableStock < stockPcsOut) {
        fail(400, `Not enough stock for ${product.name}. Available: ${availableStock}.`);
      }

      const lineTotal = roundMoney(qty * price);
      totalQty += stockPcsOut;
      totalAmount = roundMoney(totalAmount + lineTotal);

      preparedItems.push({
        source,
        productId: product._id,
        categoryId: getCategoryId(product),
        categoryName: getCategoryName(product),
        productName: product.name,
        qty,
        price,
        lineTotal,
        stockUnit: "QTY",
        packSize: 0,
        stockPcsOut,
        remarks,
      });
    }
  }

  return {
    preparedItems,
    totalQty,
    totalAmount,
  };
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("customer-deliveries.view");
  if (response) return response;

  await dbConnect();

  // Register populated models.
  void CategoryModel;

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const search = cleanString(searchParams.get("search"));
  const customerId = cleanString(searchParams.get("customerId"));
  const outletId = cleanString(searchParams.get("outletId"));
  const category = cleanDeliveryCategory(searchParams.get("category"));
  const rawCategory = cleanString(searchParams.get("category")).toUpperCase();
  const status = cleanDeliveryStatus(searchParams.get("status"));
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));

  const filter: Record<string, any> = {
    isActive: true,
  };

  if (search) {
    filter.deliveryCode = {
      $regex: escapeRegex(search),
      $options: "i",
    };
  }

  if (customerId && isValidObjectId(customerId)) {
    filter.customerId = customerId;
  }

  if (outletId && isValidObjectId(outletId)) {
    filter.outletId = outletId;
  }

  if (rawCategory === "DELIVER" || rawCategory === "PICKUP") {
    filter.category = category;
  }

  if (status) {
    filter.status = status;
  }

  if (dateFrom || dateTo) {
    filter.requestDate = {};

    const fromDate = toDate(dateFrom);
    const toDateValue = toDate(dateTo, true);

    if (fromDate) filter.requestDate.$gte = fromDate;
    if (toDateValue) filter.requestDate.$lte = toDateValue;
  }

  const [items, total, summaryRows] = await Promise.all([
    CustomerDeliveryModel.find(filter)
      .populate("customerId", "name phone address type")
      .populate("outletId", "name code address")
      .sort({ requestDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CustomerDeliveryModel.countDocuments(filter),
    CustomerDeliveryModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          rows: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] } },
          confirmed: { $sum: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } },
          totalQty: { $sum: "$totalQty" },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
    ]),
  ]);

  const summary = summaryRows[0] || {
    rows: 0,
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    totalQty: 0,
    totalAmount: 0,
  };

  return NextResponse.json({
    success: true,
    data: items.map(serializeCustomerDelivery),
    summary: {
      rows: Number(summary.rows || 0),
      pending: Number(summary.pending || 0),
      confirmed: Number(summary.confirmed || 0),
      cancelled: Number(summary.cancelled || 0),
      totalQty: Number(summary.totalQty || 0),
      totalAmount: Number(summary.totalAmount || 0),
    },
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

async function handlePOST(req: NextRequest) {
  const { response, session } = await requirePermission("customer-deliveries.manage");
  if (response) return response;

  await dbConnect();

  // Register populated models.
  void CategoryModel;

  const body = await req.json();
  const deliveryCode = cleanString(body.deliveryCode).toUpperCase();
  const customerId = cleanString(body.customerId);
  const outletId = cleanString(body.outletId);
  const category = cleanDeliveryCategory(body.category);
  const requestDateInput = cleanString(body.requestDate);
  const scheduledDateInput = cleanString(body.scheduledDate);
  const remarks = cleanString(body.remarks);
  const items: CustomerDeliveryItemInput[] = Array.isArray(body.items) ? body.items : [];

  if (!deliveryCode) {
    return NextResponse.json(
      { success: false, message: "Delivery code is required." },
      { status: 400 }
    );
  }

  if (!customerId || !isValidObjectId(customerId)) {
    return NextResponse.json(
      { success: false, message: "Valid customer is required." },
      { status: 400 }
    );
  }

  if (items.length === 0) {
    return NextResponse.json(
      { success: false, message: "At least one delivery item is required." },
      { status: 400 }
    );
  }

  if (outletId) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Internal outlets must receive stock through a main sale and its linked stock transfer.",
      },
      { status: 400 }
    );
  }

  let outletObjectId: mongoose.Types.ObjectId | undefined;

  if (outletId) {
    if (!isValidObjectId(outletId)) {
      return NextResponse.json(
        { success: false, message: "Invalid outlet selected." },
        { status: 400 }
      );
    }

    const outlet = await OutletModel.findOne({ _id: outletId, isActive: true }).lean();

    if (!outlet) {
      return NextResponse.json(
        { success: false, message: "Selected outlet was not found." },
        { status: 404 }
      );
    }

    outletObjectId = new mongoose.Types.ObjectId(outletId);
  }

  const customer = await CustomerModel.findOne({ _id: customerId, isActive: true }).lean();

  if (!customer) {
    return NextResponse.json(
      { success: false, message: "Customer not found." },
      { status: 404 }
    );
  }

  if (customer.type === "SALE") {
    return NextResponse.json(
      { success: false, message: "Customer must be Delivery or Both type." },
      { status: 400 }
    );
  }

  const duplicate = await CustomerDeliveryModel.exists({ deliveryCode, isActive: true });

  if (duplicate) {
    return NextResponse.json(
      { success: false, message: "Delivery code already exists." },
      { status: 409 }
    );
  }

  try {
    const { preparedItems, totalQty, totalAmount } = await prepareCustomerDeliveryItems(items);

    const delivery = await CustomerDeliveryModel.create({
      deliveryCode,
      customerId,
      outletId: outletObjectId,
      category,
      status: "PENDING",
      requestDate: requestDateInput ? new Date(requestDateInput) : new Date(),
      scheduledDate: scheduledDateInput ? new Date(scheduledDateInput) : undefined,
      totalItems: preparedItems.length,
      totalQty,
      totalAmount,
      remarks,
      createdBy: session?.user?.id,
      isActive: true,
    });

    await CustomerDeliveryItemModel.insertMany(
      preparedItems.map((item) => ({
        customerDeliveryId: delivery._id,
        ...item,
      }))
    );

    const savedDelivery = await CustomerDeliveryModel.findById(delivery._id)
      .populate("customerId", "name phone address type")
      .populate("outletId", "name code address")
      .lean();
    const savedItems = await CustomerDeliveryItemModel.find({
      customerDeliveryId: delivery._id,
    }).lean();

    return NextResponse.json(
      {
        success: true,
        message: "Customer delivery created successfully.",
        data: {
          ...serializeCustomerDelivery(savedDelivery),
          items: savedItems.map(serializeCustomerDeliveryItem),
        },
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
      { success: false, message: "Unable to create customer delivery." },
      { status: 500 }
    );
  }
}

export const POST = withAuditLog(handlePOST, {
  module: "CUSTOMER_DELIVERIES",
  action: "CREATE",
  entityType: "CUSTOMER_DELIVERY",
});
