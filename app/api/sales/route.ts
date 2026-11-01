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
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import CategoryModel from "@/models/Category";
import CustomerModel from "@/models/Customer";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import ProductModel from "@/models/Product";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";
import DiscountModel from "@/models/Discount";
import { applyItemDiscounts } from "@/lib/discounts";
import StandardPackingModel from "@/models/StandardPacking";
import OutletModel from "@/models/Outlet";
import StockTransferModel from "@/models/StockTransfer";
import StockTransferItemModel from "@/models/StockTransferItem";
import { generateTransferNumber, dispatchTransferInTransaction, StockTransferError } from "@/lib/stock-transfers";
import {
  packingSnapshot,
  toBaseUnitCost,
} from "@/lib/inventory-units";
import { correctionReason, recordCorrection } from "@/lib/corrections";
import { manilaDateString } from "@/lib/date-utils";
import { initialSaleFulfillment } from "@/lib/sale-fulfillment";
import { getOutletCode, getSaleOrigin } from "@/lib/sale-origin";
import { saleBusinessCategory } from "@/lib/transaction-category";
import { productQuantityAllowed } from "@/lib/product-units";

type SaleSource = "CHICKEN" | "BODEGA" | "MIXED";

type SaleItemInput = {
  discountId?: string;
  source?: string;
  productId?: string;
  bodegaProductId?: string;
  qty?: number;
  quantity?: number;
  packs?: number;
  price?: number;
  unitPrice?: number;
  pricePerPack?: number;
  packSize?: number;
  stockPcsOut?: number;
  saleUnit?: string;
  remarks?: string;
};

type PreparedSaleItem = {
  unitCode: string;
  discountId?: mongoose.Types.ObjectId;
  discountName?: string;
  discountType?: "PERCENTAGE" | "AMOUNT";
  discountValue?: number;
  discountBasis?: "PER_UNIT" | "PER_ROW";
  source: "CHICKEN" | "BODEGA";
  productType: "BODEGA_PRODUCT" | "PRODUCT";
  productId?: mongoose.Types.ObjectId;
  bodegaProductId?: mongoose.Types.ObjectId;
  categoryId?: mongoose.Types.ObjectId;
  categoryName: string;
  productName: string;
  qty: number;
  price: number;
  lineTotal: number;
  grossLineTotal?: number;
  discountAmount?: number;
  unitCost: number;
  stockUnit: "PACK" | "HEAD" | "QTY";
  packSize: number;
  stockPcsOut: number;
  baseUnit: "HEAD" | "PCS" | "QTY" | "KG";
  baseQty: number;
  entryUnit: "HEAD" | "PACK" | "QTY";
  multiplier: number;
  previousStock: number;
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

function serializeSale(sale: any, sourceBreakdown: any[] = []) {
  return {
    _id: sale._id.toString(),
    customerId: sale.customerId?._id?.toString?.() || sale.customerId?.toString?.(),
    customerName: sale.customerId?.name || "Walk-in",
    businessCategory: saleBusinessCategory(sale),
    outletCode: getOutletCode(sale),
    outletName: sale.outletId?.name || "",
    stockTransferId:
      sale.stockTransferId?._id?.toString?.() ||
      sale.stockTransferId?.toString?.() ||
      "",
    source: sale.source || "BODEGA",
    transactionType: sale.transactionType || "EXTERNAL_SALE",
    transactionLabel: sale.transactionType === "INTERNAL_TRANSFER" ? "Legacy Internal Record" : "Customer Sale",
    saleSource: getSaleOrigin(sale),
    channel: sale.channel || "WEB",
    receiptNumber: sale.receiptNumber || "",
    saleDate: sale.saleDate ? new Date(sale.saleDate).toISOString() : undefined,
    totalPacks: Number(sale.totalPacks || 0),
    totalQty: Number(sale.totalQty || 0),
    totalAmount: Number(sale.totalAmount || 0),
    subtotal: Number(sale.subtotal ?? sale.totalAmount ?? 0),
    discountId: sale.discountId?.toString?.() || "",
    discountName: sale.discountName || "",
    discountType: sale.discountType,
    discountValue: Number(sale.discountValue || 0),
    discountAmount: Number(sale.discountAmount || 0),
    paidAmount: Number(sale.paidAmount || 0),
    balance: Number(sale.balance || 0),
    status: sale.status || "UNPAID",
    paymentMethod: sale.paymentMethod || "CASH",
    remarks: sale.remarks || "",
    createdByName: sale.createdBy?.name || sale.createdBy?.username || "",
    sourceBreakdown: sourceBreakdown.map((item) => ({
      source: item.source === "CHICKEN" ? "CHICKEN" : "GROCERY",
      totalAmount: Number(item.totalAmount || 0),
      totalQty: Number(item.totalQty || 0),
    })),
    createdAt: sale.createdAt ? new Date(sale.createdAt).toISOString() : undefined,
    updatedAt: sale.updatedAt ? new Date(sale.updatedAt).toISOString() : undefined,
  };
}

function getCategoryName(product: any) {
  return (
    product.categoryName ||
    product.categoryId?.name ||
    product.category?.name ||
    "NO CATEGORY"
  );
}

function getCategoryId(product: any) {
  return product.categoryId?._id || product.categoryId || undefined;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function wholeNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getDatabaseSalePrice(source: SaleSource, product: any) {
  // SECURITY: never trust client-submitted item.price, item.unitPrice,
  // or item.pricePerPack. The backend is the source of truth.
  // CHICKEN/BodegaProduct sellingPrice is price per pack.
  // BODEGA/Product unitPrice is price per quantity.
  return source === "CHICKEN"
    ? positiveNumber(product.sellingPrice)
    : positiveNumber(product.unitPrice);
}

async function getPackSizeForBodegaProduct(
  bodegaProductId: string,
  session: mongoose.ClientSession
) {
  const standards = await StandardPackingModel.find({
    isActive: true,
    productId: bodegaProductId,
  })
    .select("standardPacking")
    .session(session)
    .lean();

  const packSizes = [
    ...new Set(
      standards
        .map((standard) => wholeNumber(standard.standardPacking))
        .filter((size) => size > 0)
    ),
  ];
  if (packSizes.length > 1) {
    fail(
      400,
      "This product has conflicting active pack sizes. Fix Standard PCS & Packs before selling it."
    );
  }
  return packSizes[0] || 0;
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("sales.view");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const source = cleanString(searchParams.get("source")).toUpperCase();
  const customerId = cleanString(searchParams.get("customerId"));
  const customer = cleanString(searchParams.get("customer"));
  const receiptNumber = cleanString(searchParams.get("receiptNumber"));
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));
  const status = cleanString(searchParams.get("status")).toUpperCase();

  const filter: Record<string, any> = {
    isVoided: false,
  };

  if (source === "OUTLET") {
    filter.$or = [
      { source: "OUTLET" },
      { channel: "MOBILE" },
      { receiptNumber: { $regex: "^MOB-", $options: "i" } },
      { remarks: { $regex: "MOBILE SALE OUTLET:", $options: "i" } },
    ];
  } else if (
    source === "CHICKEN" ||
    source === "GROCERY"
  ) {
    // The row shown in Sales History is based on SaleLine.source. A MIXED or
    // legacy sale can therefore contain CHICKEN/GROCERY lines even when the
    // parent Sale.source does not equal that label. Match both representations
    // so the filtered result agrees with what the unfiltered table displays.
    const lineSource = source === "GROCERY" ? "BODEGA" : "CHICKEN";
    const headerSource = lineSource;
    const matchingSaleIds = await SaleLineModel.distinct("saleId", {
      source: lineSource,
    });
    filter.$and = [
      {
        $or: [
          { source: headerSource },
          { _id: { $in: matchingSaleIds } },
        ],
      },
    ];
    filter.$nor = [
      { source: "OUTLET" },
      { channel: "MOBILE" },
      { receiptNumber: { $regex: "^MOB-", $options: "i" } },
      { remarks: { $regex: "MOBILE SALE OUTLET:", $options: "i" } },
    ];
  } else if (source === "MIXED") {
    filter.source = "MIXED";
    filter.$nor = [
      { source: "OUTLET" },
      { channel: "MOBILE" },
      { receiptNumber: { $regex: "^MOB-", $options: "i" } },
      { remarks: { $regex: "MOBILE SALE OUTLET:", $options: "i" } },
    ];
  }

  if (receiptNumber) {
    filter.receiptNumber = {
      $regex: escapeRegex(receiptNumber),
      $options: "i",
    };
  }

  if (status && status !== "ALL") {
    filter.status = status;
  }

  if (customerId && customerId !== "ALL") {
    if (!isValidObjectId(customerId)) {
      return NextResponse.json(
        { success: false, message: "Invalid customer filter." },
        { status: 400 }
      );
    }
    filter.customerId = customerId;
  }

  if (dateFrom || dateTo) {
    filter.saleDate = {};

    if (dateFrom) {
      filter.saleDate.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }

    if (dateTo) {
      filter.saleDate.$lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
  }

  if (!customerId && customer) {
    const customers = await CustomerModel.find({
      isActive: true,
      name: {
        $regex: escapeRegex(customer),
        $options: "i",
      },
    })
      .select("_id")
      .lean();

    filter.customerId = {
      $in: customers.map((item) => item._id),
    };
  }

  const [items, total] = await Promise.all([
    SaleModel.find(filter)
      .populate("customerId", "name outletId")
      .populate("outletId", "name code")
      .populate("createdBy", "name username")
      .sort({ saleDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SaleModel.countDocuments(filter),
  ]);

  const saleIds = items.map((item) => item._id);
  const breakdownRows =
    saleIds.length === 0
      ? []
      : await SaleLineModel.aggregate<{
          _id: { saleId: mongoose.Types.ObjectId; source: string };
          totalAmount: number;
          totalQty: number;
        }>([
          { $match: { saleId: { $in: saleIds } } },
          {
            $group: {
              _id: { saleId: "$saleId", source: "$source" },
              totalAmount: { $sum: "$lineTotal" },
              totalQty: { $sum: "$qty" },
            },
          },
        ]);
  const breakdownBySale = new Map<string, any[]>();
  for (const row of breakdownRows) {
    const saleId = row._id.saleId.toString();
    const current = breakdownBySale.get(saleId) || [];
    current.push({
      source: row._id.source,
      totalAmount: row.totalAmount,
      totalQty: row.totalQty,
    });
    breakdownBySale.set(saleId, current);
  }

  return NextResponse.json({
    success: true,
    data: items.map((item) =>
      serializeSale(item, breakdownBySale.get(item._id.toString()) || [])
    ),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

async function handlePOST(req: NextRequest) {
  const { response, session: authSession } = await requirePermission("sales.manage");
  if (response) return response;

  await dbConnect();

  // Register related models for populate and dynamic model access.
  void CategoryModel;
  void StandardPackingModel;

  const body = await req.json();
  const sourceInput = cleanString(body.source).toUpperCase();
  const source: SaleSource =
    sourceInput === "CHICKEN"
      ? "CHICKEN"
      : sourceInput === "MIXED"
        ? "MIXED"
        : "BODEGA";
  const customerId = cleanString(body.customerId);
  const saleDate = cleanString(body.saleDate);
  const receiptNumber = cleanString(body.receiptNumber);
  const remarks = cleanString(body.remarks);
  if (cleanString(body.discountId)) {
    return NextResponse.json({ success: false, message: "Select discounts on individual product rows. Refresh the sales page." }, { status: 400 });
  }
  const lateEntryReason = correctionReason(body.correctionReason);
  const items: SaleItemInput[] = Array.isArray(body.items) ? body.items : [];
  const isLateEntry = Boolean(saleDate && saleDate < manilaDateString());

  if (!customerId || !isValidObjectId(customerId)) {
    return NextResponse.json(
      { success: false, message: "Valid customer is required." },
      { status: 400 }
    );
  }

  if (!saleDate) {
    return NextResponse.json(
      { success: false, message: "Sale date is required." },
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
      { success: false, message: "A reason of at least 5 characters is required for a backdated sale." },
      { status: 400 }
    );
  }

  if (items.length === 0) {
    return NextResponse.json(
      { success: false, message: "At least one sale item is required." },
      { status: 400 }
    );
  }

  const customer = await CustomerModel.findOne({
    _id: customerId,
    isActive: true,
  }).select("_id outletId").lean();

  if (!customer) {
    return NextResponse.json(
      { success: false, message: "Customer not found." },
      { status: 404 }
    );
  }
  const linkedOutletId = customer.outletId?.toString();
  if (linkedOutletId) {
    const outletExists = await OutletModel.exists({
      _id: linkedOutletId,
      isActive: true,
      status: "ACTIVE",
    });
    if (!outletExists) {
      return NextResponse.json(
        { success: false, message: "The customer’s linked outlet is inactive or missing." },
        { status: 400 }
      );
    }
  }

  const mongoSession = await mongoose.startSession();

  try {
    let saleId: any;

    await mongoSession.withTransaction(async () => {
      let totalQty = 0;
      let totalPacks = 0;
      let totalAmount = 0;
      const preparedItems: PreparedSaleItem[] = [];

      const requestedDiscountIds = [...new Set(items.map((item) => cleanString(item.discountId)).filter(Boolean))];
      if (requestedDiscountIds.some((id) => !isValidObjectId(id))) fail(400, "Select a valid configured discount for each product.");
      const activeDiscounts = requestedDiscountIds.length
        ? await DiscountModel.find({ _id: { $in: requestedDiscountIds }, isActive: true }).session(mongoSession)
        : [];
      const discountsById = new Map(activeDiscounts.map((rule) => [String(rule._id), rule]));
      if (activeDiscounts.length !== requestedDiscountIds.length) fail(400, "A product discount is inactive or unavailable. Choose an active discount.");

      for (const item of items) {
        const itemDiscountId = cleanString(item.discountId);
        const itemDiscount = discountsById.get(itemDiscountId);
        const qty = cleanNumber(item.quantity || item.packs || item.qty);
        const itemRemarks = cleanString(item.remarks);
        const itemSourceInput = cleanString(item.source).toUpperCase();
        const itemSource: "CHICKEN" | "BODEGA" =
          source === "MIXED"
            ? itemSourceInput === "CHICKEN"
              ? "CHICKEN"
              : itemSourceInput === "BODEGA"
                ? "BODEGA"
                : fail(400, "Each mixed sale item must identify its product type.")
            : source;

        if (qty <= 0) {
          fail(400, "Quantity must be greater than zero.");
        }

        let product: any = null;
        let productType: "BODEGA_PRODUCT" | "PRODUCT" = "PRODUCT";

        if (itemSource === "CHICKEN") {
          const bodegaProductId = cleanString(item.bodegaProductId || item.productId || "");

          if (!bodegaProductId || !isValidObjectId(bodegaProductId)) {
            fail(400, "Invalid chicken product.");
          }

          product = await BodegaProductModel.findOne({
            _id: bodegaProductId,
            isActive: true,
          })
            .populate("categoryId", "name")
            .session(mongoSession);
          productType = "BODEGA_PRODUCT";
        }

        if (itemSource === "BODEGA") {
          const productId = cleanString(item.productId || "");

          if (!productId || !isValidObjectId(productId)) {
            fail(400, "Invalid grocery product.");
          }

          product = await ProductModel.findOne({ _id: productId, isActive: true })
            .populate("categoryId", "name")
            .session(mongoSession);
          productType = "PRODUCT";
        }

        if (!product) {
          fail(404, "Selected product was not found.");
        }
        if (itemSource === "BODEGA" && !await productQuantityAllowed(product.unitCode, qty)) fail(400, `Enter a valid quantity for ${product.name} in ${product.unitCode || "PCS"}. Count units require whole numbers.`);

        const price = getDatabaseSalePrice(itemSource, product);

        if (price <= 0) {
          fail(
            400,
            itemSource === "CHICKEN"
              ? `Selling price must be set in Bodega Product for ${product.name}.`
              : `Unit price must be set in Product for ${product.name}.`
          );
        }

        const previousStock =
          productType === "BODEGA_PRODUCT"
            ? Number(product.stockQty || 0)
            : Number(product.stockPcs || 0);

        const standardPackSize =
          itemSource === "CHICKEN"
            ? await getPackSizeForBodegaProduct(product._id.toString(), mongoSession)
            : 0;

        // SECURITY: for chicken sales, pack size must also come from the
        // active Standard PCS & Packs record, not from the browser request.
        // Products without an output pack standard are sold per head.
        if (itemSource === "CHICKEN" && product.unitCode === "PACK" && standardPackSize <= 0) fail(400, "Configure Standard PCS & Packs before selling this pack product.");
        const chickenUnit = standardPackSize > 0 ? "PACK" : product.unitCode === "PCS" ? "QTY" : "HEAD";
        if (itemSource === "CHICKEN" && !Number.isSafeInteger(qty)) fail(400, "Chicken pieces, heads and packs must use whole quantities.");
        const packSize = itemSource === "CHICKEN" ? standardPackSize : 1;
        const stockOut =
          itemSource === "CHICKEN" && chickenUnit === "PACK" ? qty * packSize : qty;

        if (previousStock < stockOut) {
          fail(400, `Not enough stock for ${product.name}. Available: ${previousStock}.`);
        }
        if (
          itemSource === "CHICKEN" &&
          chickenUnit === "HEAD" &&
          Number(product.stockHeads || 0) < qty
        ) {
          fail(400, `Not enough heads for ${product.name}. Available: ${Number(product.stockHeads || 0)}.`);
        }

        const lineTotal = roundMoney(qty * price);
        totalQty += itemSource === "CHICKEN" ? stockOut : qty;
        totalAmount = roundMoney(totalAmount + lineTotal);

        if (itemSource === "CHICKEN" && chickenUnit === "PACK") {
          totalPacks += qty;
        }

        preparedItems.push({
          ...(itemDiscount ? { discountId: itemDiscount._id, discountName: itemDiscount.name, discountType: itemDiscount.type, discountValue: itemDiscount.value, discountBasis: itemDiscount.basis || "PER_ROW" } : {}),
          source: itemSource,
          productType,
          unitCode: itemSource === "CHICKEN" ? (chickenUnit === "QTY" ? "PCS" : chickenUnit) : product.unitCode || "PCS",
          productId: productType === "PRODUCT" ? product._id : undefined,
          bodegaProductId: productType === "BODEGA_PRODUCT" ? product._id : undefined,
          categoryId: getCategoryId(product),
          categoryName: getCategoryName(product),
          productName: product.name,
          qty,
          price,
          lineTotal,
          unitCost: toBaseUnitCost(
            product.buyingPrice,
            packingSnapshot({
              unit: itemSource === "CHICKEN" ? chickenUnit : "QTY",
              baseUnit:
                itemSource === "CHICKEN"
                  ? chickenUnit === "PACK"
                    ? "PCS"
                    : chickenUnit === "HEAD" ? "HEAD" : "PCS"
                  : "QTY",
              multiplier: packSize,
            })
          ),
          stockUnit: itemSource === "CHICKEN" ? chickenUnit : "QTY",
          packSize: itemSource === "CHICKEN" ? packSize : 0,
          stockPcsOut: stockOut,
          baseUnit:
            itemSource === "CHICKEN"
              ? chickenUnit === "PACK"
                ? "PCS"
                : chickenUnit === "HEAD" ? "HEAD" : "PCS"
              : product.unitCode === "KG" ? "KG" : "QTY",
          baseQty: stockOut,
          entryUnit:
            itemSource === "CHICKEN" ? chickenUnit : "QTY",
          multiplier:
            itemSource === "CHICKEN" && chickenUnit === "PACK"
              ? packSize
              : 1,
          previousStock,
          remarks: itemRemarks,
        });
      }

      let discounted;
      try {
        discounted = applyItemDiscounts(preparedItems.map((item) => ({ subtotal: item.lineTotal, quantity: item.qty, discount: item.discountId ? { name: item.discountName!, type: item.discountType!, value: item.discountValue!, basis: item.discountBasis } : null })));
      } catch (error) {
        fail(400, (error as Error).message);
      }
      preparedItems.forEach((item, index) => Object.assign(item, discounted.lines[index]));
      totalAmount = discounted.totalAmount;

      const effectiveSaleDate = new Date(saleDate);
      const fulfillment = initialSaleFulfillment(
        Boolean(linkedOutletId),
        totalAmount,
        effectiveSaleDate
      );
      const [sale] = await SaleModel.create(
        [
          {
            source,
            customerId,
            transactionType: "EXTERNAL_SALE",
            ownerOutletId: linkedOutletId,
            saleDate: effectiveSaleDate,
            receiptNumber,
            totalPacks,
            totalQty,
            totalAmount,
            subtotal: discounted.subtotal,
            discountAmount: discounted.discountAmount,
            paidAmount: 0,
            ...fulfillment,
            remarks,
            createdBy: authSession?.user?.id,
            isVoided: false,
          },
        ],
        { session: mongoSession }
      );

      saleId = sale._id;

      let stockTransfer: any = null;
      if (linkedOutletId) {
        [stockTransfer] = await StockTransferModel.create(
          [{
            transferNumber: await generateTransferNumber(),
            outletId: linkedOutletId,
            saleId: sale._id,
            status: "DRAFT",
            transferDate: new Date(saleDate),
            totalItems: preparedItems.length,
            totalQty: preparedItems.reduce(
              (sum, item) => sum + item.stockPcsOut,
              0
            ),
            remarks: `AUTO-CREATED FROM SALE ${receiptNumber}`,
            createdBy: authSession?.user?.id,
          }],
          { session: mongoSession }
        );

        await StockTransferItemModel.insertMany(
          preparedItems.map((item) => ({
            transferId: stockTransfer._id,
            source:
              item.productType === "BODEGA_PRODUCT" ? "BODEGA" : "GROCERY",
            bodegaProductId: item.bodegaProductId,
            productId: item.productId,
            productName: item.productName,
            unitCode: item.unitCode,
            categoryName: item.categoryName,
            packSize: item.packSize,
            unitLabel:
              item.stockUnit === "PACK"
                ? "PACK"
                : item.stockUnit === "HEAD"
                  ? "HEAD"
                  : "QTY",
            buyingPrice: item.unitCost,
            companyUnitCost: item.unitCost,
            sellingPrice: item.qty > 0 ? item.lineTotal / item.qty : 0,
            qty: item.qty,
            qtyPcs: item.stockPcsOut,
            baseUnit: item.baseUnit,
            baseQty: item.baseQty,
            receivedQty: 0,
            receivedPcs: 0,
            varianceQty: 0,
            itemStatus: "PENDING",
            remarks: `SALE ${receiptNumber}`,
          })),
          { session: mongoSession }
        );

        sale.stockTransferId = stockTransfer._id;
        await sale.save({ session: mongoSession });
      }

      const saleLinesToInsert = [];
      const bodegaStockTransactions = [];
      const inventoryTransactions = [];

      for (const item of preparedItems) {
        let updatedProduct: any = null;
        let previousStock = item.previousStock;
        let newStock = previousStock - item.stockPcsOut;

        if (!linkedOutletId && item.productType === "BODEGA_PRODUCT") {
          const isHeadSale = item.stockUnit === "HEAD";
          updatedProduct = await BodegaProductModel.findOneAndUpdate(
            {
              _id: item.bodegaProductId,
              isActive: true,
              stockQty: { $gte: item.stockPcsOut },
              ...(isHeadSale ? { stockHeads: { $gte: item.qty } } : {}),
            },
            {
              $inc: {
                stockQty: -item.stockPcsOut,
                ...(isHeadSale ? { stockHeads: -item.qty } : {}),
              },
            },
            { new: true, session: mongoSession }
          );

          if (!updatedProduct) {
            fail(400, `Not enough stock for ${item.productName}.`);
          }

          newStock = Number(updatedProduct.stockQty || 0);
          previousStock = newStock + item.stockPcsOut;

          bodegaStockTransactions.push({
            bodegaProductId: item.bodegaProductId,
            transactionDate: new Date(saleDate),
            type: "STOCK_OUT",
            quantity: item.stockPcsOut,
            heads: isHeadSale ? item.qty : 0,
            pieces: isHeadSale ? 0 : item.stockPcsOut,
            previousStock,
            newStock,
            remarks: `SALE ${receiptNumber}`,
            referenceType: "SALE",
            referenceId: sale._id,
            createdBy: authSession?.user?.id,
          });
        }

        if (!linkedOutletId && item.productType === "PRODUCT") {
          updatedProduct = await ProductModel.findOneAndUpdate(
            {
              _id: item.productId,
              isActive: true,
              stockPcs: { $gte: item.stockPcsOut },
            },
            {
              $inc: { stockPcs: -item.stockPcsOut },
            },
            { new: true, session: mongoSession }
          );

          if (!updatedProduct) {
            fail(400, `Not enough stock for ${item.productName}.`);
          }

          newStock = Number(updatedProduct.stockPcs || 0);
          previousStock = newStock + item.stockPcsOut;
          inventoryTransactions.push({
            productId: item.productId,
            transactionDate: new Date(saleDate),
            type: "SALE",
            unit: "PCS",
            quantity: item.stockPcsOut,
            previousStock,
            newStock,
            remarks: `SALE ${receiptNumber}`,
            referenceType: "SALE",
            referenceId: sale._id,
            createdBy: authSession?.user?.id,
          });
        }

        saleLinesToInsert.push({
          saleId: sale._id,
          source: item.source,
          productId: item.productId,
          bodegaProductId: item.bodegaProductId,
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          productName: item.productName,
          unitCode: item.unitCode,
          qty: item.qty,
          price: item.price,
          lineTotal: item.lineTotal,
          grossLineTotal: item.grossLineTotal,
          discountAmount: item.discountAmount,
          discountId: item.discountId,
          discountName: item.discountName,
          discountType: item.discountType,
          discountValue: item.discountValue,
          discountBasis: item.discountBasis,
          unitCost: item.unitCost,
          stockUnit: item.stockUnit,
          packSize: item.packSize,
          stockPcsOut: item.stockPcsOut,
          baseUnit: item.baseUnit,
          baseQty: item.baseQty,
          entryUnit: item.entryUnit,
          multiplier: item.multiplier,
          remarks: item.remarks,
        });
      }

      await SaleLineModel.insertMany(saleLinesToInsert, { session: mongoSession });

      // Save and dispatch are one atomic operation. Outlet receipt remains separate.
      // Direct customer sales use the stock writes above; outlet sales use ONLY
      // the transfer dispatcher, so their stock cannot be deducted twice.
      if (stockTransfer) {
        await dispatchTransferInTransaction({
          transferId: String(stockTransfer._id),
          userId: authSession?.user?.id,
          mongoSession,
        });
      }

      if (bodegaStockTransactions.length > 0) {
        await BodegaStockTransactionModel.insertMany(bodegaStockTransactions, {
          session: mongoSession,
        });
      }

      if (inventoryTransactions.length > 0) {
        await InventoryTransactionModel.insertMany(inventoryTransactions, {
          session: mongoSession,
        });
      }

      if (isLateEntry) {
        await recordCorrection({
          entityType: "SALE",
          entityId: sale._id,
          referenceNumber: receiptNumber,
          correctionType: "LATE_ENTRY",
          reason: lateEntryReason,
          transactionDate: sale.saleDate,
          correctedBy: authSession?.user?.id,
          metadata: { postedAt: new Date().toISOString() },
          session: mongoSession,
        });
      }
    });

    const populatedSale = await SaleModel.findById(saleId)
      .populate("customerId", "name")
      .populate("outletId", "name code")
      .lean();

    return NextResponse.json(
      {
        success: true,
        message: linkedOutletId
          ? "Outlet sale saved and delivery dispatched. The outlet can now receive it. Acceptance posts the unpaid balance and linked main delivery expenses."
          : "Sale created successfully.",
        data: serializeSale(populatedSale),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ApiError || error instanceof StockTransferError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error(error);

    return NextResponse.json(
      { success: false, message: "Unable to create sale." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}

export const POST = withAuditLog(handlePOST, {
  module: "SALES",
  action: "CREATE",
  entityType: "SALE",
});
