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
import StandardPackingModel from "@/models/StandardPacking";
import OutletModel from "@/models/Outlet";
import StockTransferModel from "@/models/StockTransfer";
import StockTransferItemModel from "@/models/StockTransferItem";
import { generateTransferNumber } from "@/lib/stock-transfers";
import {
  packingSnapshot,
  toBaseUnitCost,
} from "@/lib/inventory-units";
import { correctionReason, recordCorrection } from "@/lib/corrections";
import { manilaDateString } from "@/lib/date-utils";

type SaleSource = "CHICKEN" | "BODEGA";

type SaleItemInput = {
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
  productType: "BODEGA_PRODUCT" | "PRODUCT";
  productId?: mongoose.Types.ObjectId;
  bodegaProductId?: mongoose.Types.ObjectId;
  categoryId?: mongoose.Types.ObjectId;
  categoryName: string;
  productName: string;
  qty: number;
  price: number;
  lineTotal: number;
  unitCost: number;
  stockUnit: "PACK" | "HEAD" | "QTY";
  packSize: number;
  stockPcsOut: number;
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

function serializeSale(sale: any) {
  return {
    _id: sale._id.toString(),
    customerId: sale.customerId?._id?.toString?.() || sale.customerId?.toString?.(),
    customerName: sale.customerId?.name || "",
    stockTransferId:
      sale.stockTransferId?._id?.toString?.() ||
      sale.stockTransferId?.toString?.() ||
      "",
    source: sale.source || "BODEGA",
    receiptNumber: sale.receiptNumber || "",
    saleDate: sale.saleDate ? new Date(sale.saleDate).toISOString() : undefined,
    totalPacks: Number(sale.totalPacks || 0),
    totalQty: Number(sale.totalQty || 0),
    totalAmount: Number(sale.totalAmount || 0),
    paidAmount: Number(sale.paidAmount || 0),
    balance: Number(sale.balance || 0),
    status: sale.status || "UNPAID",
    remarks: sale.remarks || "",
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
  const standard = await StandardPackingModel.findOne({
    isActive: true,
    productId: bodegaProductId,
  })
    .select("standardPacking")
    .session(session)
    .lean();

  return wholeNumber(standard?.standardPacking);
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("sales.view");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const source = cleanString(searchParams.get("source")).toUpperCase();
  const customer = cleanString(searchParams.get("customer"));
  const receiptNumber = cleanString(searchParams.get("receiptNumber"));
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));
  const status = cleanString(searchParams.get("status")).toUpperCase();

  const filter: Record<string, any> = {
    isVoided: false,
  };

  if (source === "CHICKEN" || source === "BODEGA") {
    filter.source = source;
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

  if (dateFrom || dateTo) {
    filter.saleDate = {};

    if (dateFrom) {
      filter.saleDate.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }

    if (dateTo) {
      filter.saleDate.$lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
  }

  if (customer) {
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
      .populate("customerId", "name")
      .sort({ saleDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SaleModel.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map(serializeSale),
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
  const source: SaleSource = sourceInput === "CHICKEN" ? "CHICKEN" : "BODEGA";
  const customerId = cleanString(body.customerId);
  const saleDate = cleanString(body.saleDate);
  const receiptNumber = cleanString(body.receiptNumber);
  const remarks = cleanString(body.remarks);
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

      for (const item of items) {
        const qty = cleanNumber(item.quantity || item.packs || item.qty);
        const itemRemarks = cleanString(item.remarks);

        if (qty <= 0) {
          fail(400, "Quantity must be greater than zero.");
        }

        let product: any = null;
        let productType: "BODEGA_PRODUCT" | "PRODUCT" = "PRODUCT";

        if (source === "CHICKEN") {
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

        if (source === "BODEGA") {
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

        const price = getDatabaseSalePrice(source, product);

        if (price <= 0) {
          fail(
            400,
            source === "CHICKEN"
              ? `Selling price must be set in Bodega Product for ${product.name}.`
              : `Unit price must be set in Product for ${product.name}.`
          );
        }

        const previousStock =
          productType === "BODEGA_PRODUCT"
            ? Number(product.stockQty || 0)
            : Number(product.stockPcs || 0);

        const standardPackSize =
          source === "CHICKEN"
            ? await getPackSizeForBodegaProduct(product._id.toString(), mongoSession)
            : 0;

        // SECURITY: for chicken sales, pack size must also come from the
        // active Standard PCS & Packs record, not from the browser request.
        // Products without an output pack standard are sold per head.
        const chickenUnit = standardPackSize > 0 ? "PACK" : "HEAD";
        const packSize = source === "CHICKEN" ? standardPackSize : 1;
        const stockOut =
          source === "CHICKEN" && chickenUnit === "PACK" ? qty * packSize : qty;

        if (previousStock < stockOut) {
          fail(400, `Not enough stock for ${product.name}. Available: ${previousStock}.`);
        }
        if (
          source === "CHICKEN" &&
          chickenUnit === "HEAD" &&
          Number(product.stockHeads || 0) < qty
        ) {
          fail(400, `Not enough heads for ${product.name}. Available: ${Number(product.stockHeads || 0)}.`);
        }

        const lineTotal = roundMoney(qty * price);
        totalQty += source === "CHICKEN" ? stockOut : qty;
        totalAmount = roundMoney(totalAmount + lineTotal);

        if (source === "CHICKEN" && chickenUnit === "PACK") {
          totalPacks += qty;
        }

        preparedItems.push({
          productType,
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
              unit: source === "CHICKEN" && chickenUnit === "PACK" ? "PACK" : "QTY",
              baseUnit: "PCS",
              multiplier: packSize,
            })
          ),
          stockUnit: source === "CHICKEN" ? chickenUnit : "QTY",
          packSize: source === "CHICKEN" ? packSize : 0,
          stockPcsOut: stockOut,
          previousStock,
          remarks: itemRemarks,
        });
      }

      const [sale] = await SaleModel.create(
        [
          {
            source,
            customerId,
            saleDate: new Date(saleDate),
            receiptNumber,
            totalPacks,
            totalQty,
            totalAmount,
            paidAmount: 0,
            balance: totalAmount,
            status: "UNPAID",
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
            categoryName: item.categoryName,
            packSize: item.packSize,
            unitLabel:
              item.stockUnit === "PACK"
                ? "PACK"
                : item.stockUnit === "HEAD"
                  ? "HEAD"
                  : "QTY",
            buyingPrice: item.unitCost,
            sellingPrice: item.price,
            qty: item.qty,
            qtyPcs: item.stockPcsOut,
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
          source,
          productId: item.productId,
          bodegaProductId: item.bodegaProductId,
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          productName: item.productName,
          qty: item.qty,
          price: item.price,
          lineTotal: item.lineTotal,
          unitCost: item.unitCost,
          stockUnit: item.stockUnit,
          packSize: item.packSize,
          stockPcsOut: item.stockPcsOut,
          remarks: item.remarks,
        });
      }

      await SaleLineModel.insertMany(saleLinesToInsert, { session: mongoSession });

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
      .lean();

    return NextResponse.json(
      {
        success: true,
        message: linkedOutletId
          ? "Sale created successfully with a pending stock transfer."
          : "Sale created successfully.",
        data: serializeSale(populatedSale),
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
