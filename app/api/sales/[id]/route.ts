import { NextRequest, NextResponse } from "next/server";
import { mainPaymentStatus } from "@/lib/main-payment-policy";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import ProductModel from "@/models/Product";
import SaleModel from "@/models/Sale";
import MainCustomerReturn from "@/models/MainCustomerReturn";
import SaleLineModel from "@/models/SaleLine";
import StockTransferModel from "@/models/StockTransfer";
import { getSaleOrigin } from "@/lib/sale-origin";
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

function serializeSale(sale: any, lines: any[] = []) {
  return {
    _id: sale._id.toString(),
    receiptNumber: sale.receiptNumber,
    customerId: sale.customerId?._id?.toString?.() || sale.customerId?.toString?.(),
    customerName: sale.customerId?.name || "Walk-in",
    saleDate: sale.saleDate ? new Date(sale.saleDate).toISOString() : undefined,
    source: sale.source,
    transactionType: sale.transactionType || "EXTERNAL_SALE",
    transactionLabel: sale.ownerOutletId ? "Internal Outlet Sale" : sale.transactionType === "INTERNAL_TRANSFER" ? "Legacy Internal Record" : "Customer Sale",
    saleSource: getSaleOrigin(sale),
    totalAmount: sale.totalAmount || 0,
    returnedAmount: Number(sale.returnedAmount || 0),
    refundedAmount: Number(sale.refundedAmount || 0),
    netAfterReturns: Number(sale.totalAmount || 0) - Number(sale.returnedAmount || 0),
    subtotal: Number(sale.subtotal ?? sale.totalAmount ?? 0),
    discountName: sale.discountName || "",
    discountType: sale.discountType,
    discountValue: Number(sale.discountValue || 0),
    discountAmount: Number(sale.discountAmount || 0),
    paidAmount: sale.paidAmount || 0,
    balance: sale.balance || 0,
    totalPacks: sale.totalPacks || 0,
    totalQty: sale.totalQty || 0,
    remarks: sale.remarks || "",
    status: mainPaymentStatus(sale.status),
    createdByName: sale.createdBy?.name || sale.createdBy?.username || "",
    lines: lines.map((line) => ({
      _id: line._id.toString(),
      source: line.source,
      inventorySource: line.source,
      categoryName: line.categoryName,
      productName: line.productName,
      qty: line.qty || 0,
      price: line.price || 0,
      lineTotal: line.lineTotal || 0,
      grossLineTotal: Number(line.grossLineTotal ?? line.lineTotal ?? 0),
      discountAmount: Number(line.discountAmount || 0),
      discountId: line.discountId?.toString?.() || "",
      discountName: line.discountName || "",
      discountType: line.discountType,
      discountValue: Number(line.discountValue || 0),
      discountBasis: line.discountBasis || "PER_ROW",
      stockUnit: line.stockUnit,
      packSize: line.packSize || 0,
      stockPcsOut: line.stockPcsOut || 0,
      baseUnit: line.baseUnit || (line.stockUnit === "HEAD" ? "HEAD" : line.source === "GROCERY" ? "QTY" : "PCS"),
      baseQty: Number(line.baseQty ?? line.stockPcsOut ?? line.qty ?? 0),
      entryUnit: line.entryUnit || line.stockUnit,
      multiplier: Number(line.multiplier || (line.stockUnit === "PACK" ? line.packSize : 1) || 1),
      remarks: line.remarks || "",
    })),
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission(["sales.view", "sales.manage"]);
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid sale ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const sale = await SaleModel.findOne({ _id: id, isVoided: false })
    .populate("customerId", "name")
    .populate("createdBy", "name username")
    .lean();

  if (!sale) {
    return NextResponse.json(
      { success: false, message: "Sale not found." },
      { status: 404 }
    );
  }

  const lines = await SaleLineModel.find({ saleId: id }).lean();

  return NextResponse.json({
    success: true,
    data: serializeSale(sale, lines),
  });
}

async function handleDELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission("sales.manage");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid sale ID." },
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

  const mongoSession = await mongoose.startSession();

  try {
    await mongoSession.withTransaction(async () => {
      if (await MainCustomerReturn.exists({ saleId: id, status: "POSTED" }).session(mongoSession)) fail(409, "A posted customer return exists. This sale cannot be voided or restored twice.");
      if (await SaleModel.exists({ _id: id, source: "OUTLET" }).session(mongoSession)) {
        fail(409, "Outlet sales cannot be voided from main sales. Employee balances and outlet inventory require an outlet-specific correction.");
      }
      const linkedTransfer = await StockTransferModel.findOne({ saleId: id })
        .session(mongoSession);

      if (
        linkedTransfer &&
        !["DRAFT", "CANCELLED"].includes(linkedTransfer.status)
      ) {
        fail(
          400,
          "Cancel the linked stock transfer before voiding this sale. Confirmed transfers cannot be voided."
        );
      }

      if (linkedTransfer?.status === "DRAFT") {
        const cancelled = await StockTransferModel.findOneAndUpdate(
          { _id: linkedTransfer._id, status: "DRAFT" },
          {
            $set: {
              status: "CANCELLED",
              cancelledAt: new Date(),
              cancelledBy: session?.user?.id,
            },
          },
          { new: true, session: mongoSession }
        );
        if (!cancelled) {
          fail(409, "The linked stock transfer changed. Refresh and try again.");
        }
      }

      // Atomically claim the sale so two simultaneous voids cannot both run.
      const sale = await SaleModel.findOneAndUpdate(
        { _id: id, isVoided: false, paidAmount: { $lte: 0 } },
        { $set: { isVoided: true, status: "VOIDED", balance: 0 } },
        { new: true, session: mongoSession }
      );

      if (!sale) {
        const existing = await SaleModel.findById(id)
          .select("isVoided paidAmount")
          .session(mongoSession)
          .lean();

        if (!existing || (existing as any).isVoided) {
          fail(404, "Sale not found.");
        }

        fail(
          400,
          "This sale already has payment. Remove or adjust payment first."
        );
      }

      const lines = await SaleLineModel.find({ saleId: sale._id }).session(
        mongoSession
      );

      const inventoryTransactions = [];
      const bodegaTransactions = [];

      for (const line of lines) {
        // Outlet-linked sales move stock through their transfer. A cancelled
        // transfer has already restored stock, while a draft never deducted it.
        if (linkedTransfer) continue;

        const stockToRestore = Number(line.baseQty ?? line.stockPcsOut ?? line.qty ?? 0);

        if (stockToRestore <= 0) continue;

        if (line.source === "CHICKEN" && line.bodegaProductId) {
          const isHeadSale = line.stockUnit === "HEAD";
          const product = await BodegaProductModel.findOneAndUpdate(
            { _id: line.bodegaProductId },
            {
              $inc: {
                stockQty: stockToRestore,
                ...(isHeadSale ? { stockHeads: Number(line.qty || 0) } : {}),
                ...(line.kilosOut != null ? { stockKilos: Number(line.kilosOut) } : {}),
              },
            },
            { new: true, session: mongoSession }
          );

          if (!product) continue;

          const newStock = Number(product.stockQty || 0);

          bodegaTransactions.push({
            bodegaProductId: product._id,
            type: "VOID_REVERSAL",
            quantity: stockToRestore,
            heads: isHeadSale ? Number(line.qty || 0) : 0,
            pieces: isHeadSale || line.baseUnit === "KG" ? 0 : stockToRestore,
            kilos: Number(line.kilosOut || 0), kilosDelta: line.kilosOut,
            previousStock: newStock - stockToRestore,
            newStock,
            remarks: `VOID SALE ${sale.receiptNumber}`,
            referenceType: "SALE_VOID",
            referenceId: sale._id,
            createdBy: session?.user?.id,
          });
        }

        if (line.source === "BODEGA" && line.productId) {
          const product = await ProductModel.findOneAndUpdate(
            { _id: line.productId },
            { $inc: { stockPcs: stockToRestore } },
            { new: true, session: mongoSession }
          );

          if (!product) continue;

          const newStock = Number(product.stockPcs || 0);

          inventoryTransactions.push({
            productId: product._id,
            type: "VOID_REVERSAL",
            unit: "PCS",
            quantity: stockToRestore,
            previousStock: newStock - stockToRestore,
            newStock,
            remarks: `VOID SALE ${sale.receiptNumber}`,
            referenceType: "SALE_VOID",
            referenceId: sale._id,
            createdBy: session?.user?.id,
          });
        }
      }

      if (inventoryTransactions.length > 0) {
        await InventoryTransactionModel.insertMany(inventoryTransactions, {
          session: mongoSession,
        });
      }

      if (bodegaTransactions.length > 0) {
        await BodegaStockTransactionModel.insertMany(bodegaTransactions, {
          session: mongoSession,
        });
      }

      await recordCorrection({
        entityType: "SALE",
        entityId: sale._id,
        referenceNumber: sale.receiptNumber,
        correctionType: "VOID",
        reason,
        transactionDate: sale.saleDate,
        correctedBy: session?.user?.id,
        metadata: {
          totalAmount: Number(sale.totalAmount || 0),
          restoredLines: lines.length,
        },
        session: mongoSession,
      });
    });

    return NextResponse.json({
      success: true,
      message: "Sale voided successfully and stocks were reversed.",
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
      { success: false, message: "Unable to void sale." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}

export const DELETE = withAuditLog(handleDELETE, {
  module: "SALES",
  action: "VOID",
  entityType: "SALE",
});
