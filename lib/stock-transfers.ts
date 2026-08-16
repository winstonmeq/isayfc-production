// lib/stock-transfers.ts
//
// Shared logic for the Stock Transfer (delivery order) module:
// transfer number generation and the transactional dispatch operation
// (used both by "create & dispatch" and by dispatching an existing draft).

import mongoose, { Types, isValidObjectId } from "mongoose";

import { cleanString } from "@/lib/crud-utils";
import { manilaDateString } from "@/lib/date-utils";
import {
  packingSnapshot,
  toBaseQuantity,
} from "@/lib/inventory-units";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import ProductModel from "@/models/Product";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import StockTransferModel from "@/models/StockTransfer";
import StandardPackingModel from "@/models/StandardPacking";
import StockTransferItemModel from "@/models/StockTransferItem";

export class StockTransferError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function transferFail(status: number, message: string): never {
  throw new StockTransferError(status, message);
}

/**
 * Generates the next "TRF-YYYYMMDD-NNNN" number for the current Manila day.
 * The unique index on transferNumber is the real guarantee — callers retry
 * once on a duplicate-key error (E11000).
 */
export async function generateTransferNumber() {
  const datePart = manilaDateString().replaceAll("-", "");
  const prefix = `TRF-${datePart}-`;

  const latest = await StockTransferModel.findOne({
    transferNumber: { $regex: `^${prefix}` },
  })
    .sort({ transferNumber: -1 })
    .select("transferNumber")
    .lean();

  const lastSequence = latest
    ? Number(String(latest.transferNumber).slice(prefix.length)) || 0
    : 0;

  return `${prefix}${String(lastSequence + 1).padStart(4, "0")}`;
}

export function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

/**
 * Dispatches a DRAFT transfer: atomically claims it, deducts bodega stock
 * per item with a conditional guard (refuses on insufficient stock instead
 * of clamping), and writes the STOCK_OUT ledger entries.
 *
 * Must run inside the provided session's withTransaction.
 */
export async function dispatchTransferInTransaction({
  transferId,
  userId,
  mongoSession,
}: {
  transferId: string;
  userId?: string;
  mongoSession: mongoose.ClientSession;
}) {
  const transfer = await StockTransferModel.findOneAndUpdate(
    { _id: transferId, status: "DRAFT" },
    {
      $set: {
        status: "IN_TRANSIT",
        dispatchedAt: new Date(),
        dispatchedBy: userId,
      },
    },
    { new: true, session: mongoSession }
  );

  if (!transfer) {
    const exists = await StockTransferModel.exists({ _id: transferId });
    transferFail(
      exists ? 400 : 404,
      exists
        ? "Only draft transfers can be dispatched."
        : "Stock transfer not found."
    );
  }

  const items = await StockTransferItemModel.find({
    transferId: transfer._id,
  }).session(mongoSession);

  if (items.length === 0) {
    transferFail(400, "Cannot dispatch a transfer with no items.");
  }

  const bodegaLedger = [];
  const groceryLedger = [];

  for (const item of items) {
    // New rows use baseQty; qtyPcs remains a legacy compatibility field.
    const baseQty = Number(item.baseQty ?? item.qtyPcs ?? item.qty ?? 0);

    if (baseQty <= 0) continue;

    if (item.source === "GROCERY") {
      const product = await ProductModel.findOneAndUpdate(
        { _id: item.productId, isActive: true, stockPcs: { $gte: baseQty } },
        { $inc: { stockPcs: -baseQty } },
        { new: true, session: mongoSession }
      );

      if (!product) {
        const current = await ProductModel.findById(item.productId)
          .select("name stockPcs isActive")
          .session(mongoSession)
          .lean();

        if (!current || current.isActive === false) {
          transferFail(
            400,
            `${item.productName} is no longer available. Remove it from the transfer first.`
          );
        }

        transferFail(
          400,
          `Insufficient stock for ${item.productName}: only ${Number(
            current.stockPcs ?? 0
          )} available but the transfer needs ${baseQty}.`
        );
      }

      const newStock = Number(product.stockPcs || 0);

      groceryLedger.push({
        productId: product._id,
        transactionDate: transfer.transferDate || new Date(),
        type: "STOCK_OUT",
        unit: "PCS",
        quantity: baseQty,
        previousStock: newStock + baseQty,
        newStock,
        remarks: `STOCK TRANSFER ${transfer.transferNumber}`,
        referenceType: "STOCK_TRANSFER",
        referenceId: transfer._id,
        createdBy: userId,
      });

      continue;
    }

    // BODEGA stock is held in its explicit base unit (HEAD or PCS).
    const isHeadTransfer = item.unitLabel === "HEAD";
    const product = await BodegaProductModel.findOneAndUpdate(
      {
        _id: item.bodegaProductId,
        isActive: true,
        stockQty: { $gte: baseQty },
        ...(isHeadTransfer ? { stockHeads: { $gte: Number(item.qty) } } : {}),
      },
      {
        $inc: {
          stockQty: -baseQty,
          ...(isHeadTransfer ? { stockHeads: -Number(item.qty) } : {}),
        },
      },
      { new: true, session: mongoSession }
    );

    if (!product) {
      const current = await BodegaProductModel.findById(item.bodegaProductId)
        .select("name stockQty isActive")
        .session(mongoSession)
        .lean();

      if (!current || current.isActive === false) {
        transferFail(
          400,
          `${item.productName} is no longer available. Remove it from the transfer first.`
        );
      }

      const available = Number(current.stockQty ?? 0);
      const need =
        item.unitLabel === "PACK" && item.packSize > 0
          ? `${item.qty} pack(s) (${baseQty} pcs)`
          : `${baseQty} ${isHeadTransfer ? "head(s)" : "pcs"}`;
      const have =
        item.unitLabel === "PACK" && item.packSize > 0
          ? `${Math.floor(available / item.packSize)} pack(s) (${available} pcs)`
          : `${available}`;

      transferFail(
        400,
        `Insufficient stock for ${item.productName}: only ${have} available but the transfer needs ${need}.`
      );
    }

    const newStock = Number(product.stockQty || 0);

    bodegaLedger.push({
      bodegaProductId: product._id,
      transactionDate: transfer.transferDate || new Date(),
      type: "STOCK_OUT",
      quantity: baseQty,
      heads: isHeadTransfer ? Number(item.qty) : 0,
      pieces: isHeadTransfer ? 0 : baseQty,
      previousStock: newStock + baseQty,
      newStock,
      remarks: `STOCK TRANSFER ${transfer.transferNumber}`,
      referenceType: "STOCK_TRANSFER",
      referenceId: transfer._id,
      createdBy: userId,
    });
  }

  if (bodegaLedger.length > 0) {
    await BodegaStockTransactionModel.insertMany(bodegaLedger, {
      session: mongoSession,
    });
  }

  if (groceryLedger.length > 0) {
    await InventoryTransactionModel.insertMany(groceryLedger, {
      session: mongoSession,
    });
  }

  return transfer;
}

type TransferItemInput = {
  source?: string;
  bodegaProductId?: string;
  productId?: string;
  standardPackingId?: string;
  qty?: number;
};

/**
 * Validates and snapshots requested items against active products, supporting
 * both bodega products (BODEGA, may be pack-based) and grocery products
 * (GROCERY, sold by piece). For pack-based bodega products, `qty` is the
 * number of PACKS and `qtyPcs` is the resulting pieces (qty * packSize).
 * Returns prepared item documents (without transferId).
 */
export async function prepareTransferItems(itemsInput: TransferItemInput[]) {
  if (!Array.isArray(itemsInput) || itemsInput.length === 0) {
    transferFail(400, "At least one product is required.");
  }

  if (itemsInput.length > 200) {
    transferFail(400, "Too many items in one transfer (maximum 200).");
  }

  const seen = new Set<string>();
  const prepared = [];

  for (const input of itemsInput) {
    const source = String(input?.source || "BODEGA").toUpperCase() === "GROCERY"
      ? "GROCERY"
      : "BODEGA";
    const productKey = cleanString(
      source === "GROCERY" ? input?.productId : input?.bodegaProductId
    );
    const rawQty = Number(input?.qty);

    if (!isValidObjectId(productKey)) {
      transferFail(400, "Invalid product in transfer items.");
    }

    const dedupeKey = `${source}:${productKey}`;
    if (seen.has(dedupeKey)) {
      transferFail(400, "Duplicate product in transfer items.");
    }
    seen.add(dedupeKey);

    if (!Number.isFinite(rawQty) || !Number.isInteger(rawQty) || rawQty < 1) {
      transferFail(400, "Each item quantity must be a whole number of at least 1.");
    }
    const qty = rawQty;

    if (source === "GROCERY") {
      const product = await ProductModel.findOne({
        _id: productKey,
        isActive: true,
      })
        .populate("categoryId", "name")
        .lean<{
          _id: Types.ObjectId;
          name?: string;
          buyingPrice?: number;
          sellingPrice?: number;
          categoryId?: { name?: string } | Types.ObjectId | null;
        }>();

      if (!product) {
        transferFail(404, "One of the selected grocery products was not found.");
      }

      prepared.push({
        source: "GROCERY" as const,
        productId: product._id,
        bodegaProductId: undefined,
        productName: String(product.name || ""),
        categoryName: categoryNameOf(product.categoryId),
        packSize: 0,
        unitLabel: "QTY" as const,
        buyingPrice: Number(product.buyingPrice || 0),
        sellingPrice: Number(product.sellingPrice || 0),
        qty,
        qtyPcs: qty,
        baseUnit: "QTY" as const,
        baseQty: qty,
        receivedQty: 0,
        receivedPcs: 0,
        varianceQty: 0,
        itemStatus: "PENDING" as const,
        remarks: "",
      });

      continue;
    }

    // BODEGA
    const product = await BodegaProductModel.findOne({
      _id: productKey,
      isActive: true,
    })
      .populate("categoryId", "name")
      .lean<{
        _id: Types.ObjectId;
        name?: string;
        buyingPrice?: number;
        sellingPrice?: number;
        categoryId?: { name?: string } | Types.ObjectId | null;
      }>();

    if (!product) {
      transferFail(404, "One of the selected products was not found.");
    }

    const standardPackingId = cleanString(input?.standardPackingId);
    if (standardPackingId && !isValidObjectId(standardPackingId)) {
      transferFail(400, "Invalid packing configuration in transfer items.");
    }

    const standard = standardPackingId
      ? await StandardPackingModel.findOne({
          _id: new Types.ObjectId(standardPackingId),
          isActive: true,
          productId: new Types.ObjectId(productKey),
          standardPacking: { $gt: 0 },
        })
          .select("standardPacking")
          .lean<{ _id: Types.ObjectId; standardPacking?: number }>()
      : null;

    if (standardPackingId && !standard) {
      transferFail(
        400,
        "The selected packing configuration is no longer active for this product."
      );
    }

    const packSize = Math.max(0, Math.trunc(Number(standard?.standardPacking || 0)));
    const isPack = packSize > 0;
    const isWholeChicken = !isPack && Boolean(
      await StandardPackingModel.exists({
        isActive: true,
        wholeChickenId: new Types.ObjectId(productKey),
      })
    );
    const baseUnit = isWholeChicken ? "HEAD" as const : "PCS" as const;
    const packing = packingSnapshot({
      packingId: standard?._id.toString(),
      unit: isPack ? "PACK" : baseUnit,
      baseUnit,
      multiplier: packSize,
    });

    prepared.push({
      source: "BODEGA" as const,
      bodegaProductId: product._id,
      productId: undefined,
      standardPackingId: standard?._id,
      productName: String(product.name || ""),
      categoryName: categoryNameOf(product.categoryId),
      packSize,
      // Pack products are entered/counted in PACKS; others in PCS.
      unitLabel: (isPack ? "PACK" : baseUnit) as "PACK" | "HEAD" | "PCS",
      buyingPrice: Number(product.buyingPrice || 0),
      sellingPrice: Number(product.sellingPrice || 0),
      qty,
      qtyPcs: toBaseQuantity(qty, packing),
      baseUnit,
      baseQty: toBaseQuantity(qty, packing),
      receivedQty: 0,
      receivedPcs: 0,
      varianceQty: 0,
      itemStatus: "PENDING" as const,
      remarks: "",
    });
  }

  return prepared;
}

function categoryNameOf(
  categoryId: { name?: string } | Types.ObjectId | null | undefined
) {
  return categoryId &&
    typeof categoryId === "object" &&
    "name" in categoryId
    ? String(categoryId.name || "")
    : "";
}

type LeanTransfer = {
  _id: { toString: () => string };
  transferNumber?: string;
  status?: string;
  transferDate?: Date | string;
  outletId?:
    | { _id?: { toString?: () => string }; name?: string; code?: string }
    | { toString?: () => string }
    | null;
  totalItems?: number;
  totalQty?: number;
  totalReceivedQty?: number;
  totalVarianceQty?: number;
  hasDiscrepancy?: boolean;
  remarks?: string;
  outletRemarks?: string;
  dispatchedAt?: Date | string;
  deliveredAt?: Date | string;
  confirmedAt?: Date | string;
  createdAt?: Date | string;
};

export function serializeTransfer(transfer: LeanTransfer) {
  const outlet = transfer.outletId as {
    _id?: { toString?: () => string };
    name?: string;
    code?: string;
    toString?: () => string;
  } | null;

  return {
    _id: transfer._id.toString(),
    transferNumber: transfer.transferNumber || "",
    status: transfer.status || "DRAFT",
    transferDate: transfer.transferDate
      ? new Date(transfer.transferDate).toISOString()
      : undefined,
    outletId: outlet ? outlet._id?.toString?.() || outlet.toString?.() || "" : "",
    outletName: outlet?.name || "",
    outletCode: outlet?.code || "",
    totalItems: Number(transfer.totalItems || 0),
    totalQty: Number(transfer.totalQty || 0),
    totalReceivedQty: Number(transfer.totalReceivedQty || 0),
    totalVarianceQty: Number(transfer.totalVarianceQty || 0),
    hasDiscrepancy: Boolean(transfer.hasDiscrepancy),
    remarks: transfer.remarks || "",
    outletRemarks: transfer.outletRemarks || "",
    dispatchedAt: transfer.dispatchedAt
      ? new Date(transfer.dispatchedAt).toISOString()
      : undefined,
    deliveredAt: transfer.deliveredAt
      ? new Date(transfer.deliveredAt).toISOString()
      : undefined,
    confirmedAt: transfer.confirmedAt
      ? new Date(transfer.confirmedAt).toISOString()
      : undefined,
    createdAt: transfer.createdAt
      ? new Date(transfer.createdAt).toISOString()
      : undefined,
  };
}
