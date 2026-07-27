// app/api/stock-transfers/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanString } from "@/lib/crud-utils";
import {
  StockTransferError,
  prepareTransferItems,
  serializeTransfer,
  transferFail,
} from "@/lib/stock-transfers";
import BodegaProductModel from "@/models/BodegaProduct";
import ProductModel from "@/models/Product";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import OutletModel from "@/models/Outlet";
import StockTransferModel from "@/models/StockTransfer";
import StockTransferItemModel from "@/models/StockTransferItem";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LeanItem = {
  _id: { toString: () => string };
  source?: string;
  bodegaProductId?: { toString?: () => string } | null;
  productId?: { toString?: () => string } | null;
  standardPackingId?: { toString?: () => string } | null;
  productName?: string;
  unitLabel?: string;
  qtyPcs?: number;
  receivedPcs?: number;
  categoryName?: string;
  packSize?: number;
  buyingPrice?: number;
  sellingPrice?: number;
  qty?: number;
  receivedQty?: number;
  varianceQty?: number;
  itemStatus?: string;
  remarks?: string;
};

function serializeItem(item: LeanItem) {
  return {
    _id: item._id.toString(),
    source: item.source || "BODEGA",
    bodegaProductId: item.bodegaProductId?.toString?.() || "",
    productId: item.productId?.toString?.() || "",
    standardPackingId: item.standardPackingId?.toString?.() || "",
    unitLabel: item.unitLabel || "PCS",
    qtyPcs: Number(item.qtyPcs || 0),
    receivedPcs: Number(item.receivedPcs || 0),
    productName: item.productName || "",
    categoryName: item.categoryName || "",
    packSize: Number(item.packSize || 0),
    buyingPrice: Number(item.buyingPrice || 0),
    sellingPrice: Number(item.sellingPrice || 0),
    qty: Number(item.qty || 0),
    receivedQty: Number(item.receivedQty || 0),
    varianceQty: Number(item.varianceQty || 0),
    itemStatus: item.itemStatus || "PENDING",
    remarks: item.remarks || "",
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission([
    "stock-transfers.view",
    "stock-transfers.manage",
    "stock-transfers.confirm",
  ]);
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid transfer ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  void OutletModel;

  const [transfer, items] = await Promise.all([
    StockTransferModel.findById(id)
      .populate("outletId", "name code address contactNumber managerName")
      .lean(),
    StockTransferItemModel.find({ transferId: id }).sort({ createdAt: 1 }).lean(),
  ]);

  if (!transfer) {
    return NextResponse.json(
      { success: false, message: "Stock transfer not found." },
      { status: 404 }
    );
  }

  const outlet = (transfer as {
    outletId?: {
      address?: string;
      contactNumber?: string;
      managerName?: string;
    } | null;
  }).outletId;

  return NextResponse.json({
    success: true,
    data: {
      ...serializeTransfer(transfer as Parameters<typeof serializeTransfer>[0]),
      outletAddress: outlet?.address || "",
      outletContact: outlet?.contactNumber || "",
      outletManager: outlet?.managerName || "",
      items: (items as unknown as LeanItem[]).map(serializeItem),
    },
  });
}

async function handlePATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("stock-transfers.manage");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid transfer ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  let body: {
    outletId?: string;
    remarks?: string;
    transferDate?: string;
    items?: {
      source?: string;
      bodegaProductId?: string;
      productId?: string;
      standardPackingId?: string;
      qty?: number;
    }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body." },
      { status: 400 }
    );
  }

  try {
    const transfer = await StockTransferModel.findById(id);

    if (!transfer) {
      transferFail(404, "Stock transfer not found.");
    }

    if (transfer.status !== "DRAFT") {
      transferFail(400, "Only draft transfers can be edited.");
    }
    if (transfer.saleId) {
      transferFail(
        400,
        "This transfer was generated from a sale. Edit or void the linked sale instead."
      );
    }

    const outletId = cleanString(body?.outletId);

    if (!isValidObjectId(outletId)) {
      transferFail(400, "Please select a valid outlet.");
    }

    const outlet = await OutletModel.findOne({
      _id: outletId,
      isActive: true,
      status: "ACTIVE",
    }).lean();

    if (!outlet) {
      transferFail(404, "Outlet not found or inactive.");
    }

    const preparedItems = await prepareTransferItems(body?.items || []);
    const transferDateInput = cleanString(body?.transferDate);

    await StockTransferItemModel.deleteMany({ transferId: transfer._id });
    await StockTransferItemModel.insertMany(
      preparedItems.map((item) => ({ ...item, transferId: transfer._id }))
    );

    transfer.outletId = outletId as never;
    transfer.remarks = cleanString(body?.remarks);
    transfer.totalItems = preparedItems.length;
    transfer.totalQty = preparedItems.reduce((sum, item) => sum + item.qtyPcs, 0);

    if (transferDateInput) {
      transfer.transferDate = new Date(transferDateInput);
    }

    await transfer.save();

    return NextResponse.json({
      success: true,
      message: `Transfer ${transfer.transferNumber} updated.`,
    });
  } catch (error) {
    if (error instanceof StockTransferError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error(error);

    return NextResponse.json(
      { success: false, message: "Unable to update stock transfer." },
      { status: 500 }
    );
  }
}

async function handleDELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission(
    "stock-transfers.manage"
  );
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid transfer ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const mongoSession = await mongoose.startSession();

  try {
    let cancelledNumber = "";
    let stockRestored = false;
    let linkedToSale = false;

    await mongoSession.withTransaction(async () => {
      const transferBeforeCancel = await StockTransferModel.findById(id)
        .select("status saleId")
        .session(mongoSession)
        .lean();

      if (transferBeforeCancel?.saleId && transferBeforeCancel.status === "DRAFT") {
        transferFail(
          400,
          "This draft was generated from a sale. Void the linked sale to cancel both records."
        );
      }
      linkedToSale = Boolean(transferBeforeCancel?.saleId);

      // Atomically claim: only DRAFT or IN_TRANSIT transfers can be cancelled.
      const transfer = await StockTransferModel.findOneAndUpdate(
        { _id: id, status: { $in: ["DRAFT", "IN_TRANSIT"] } },
        {
          $set: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancelledBy: session?.user?.id,
          },
        },
        { new: false, session: mongoSession }
      );

      if (!transfer) {
        const existing = await StockTransferModel.findById(id)
          .select("status")
          .session(mongoSession)
          .lean();

        if (!existing) {
          transferFail(404, "Stock transfer not found.");
        }

        transferFail(
          400,
          existing.status === "CONFIRMED"
            ? "Confirmed transfers cannot be cancelled."
            : existing.status === "DELIVERED"
              ? "This transfer was already received by the outlet. Ask the outlet to confirm or reject it instead."
              : "This transfer is already cancelled."
        );
      }

      cancelledNumber = transfer.transferNumber;

      // If stock already left the bodega, restore it.
      if (transfer.status === "IN_TRANSIT") {
        stockRestored = true;
        const items = await StockTransferItemModel.find({
          transferId: transfer._id,
        }).session(mongoSession);

        const bodegaLedger = [];
        const groceryLedger = [];

        for (const item of items) {
          const pcs = Number(item.qtyPcs || item.qty || 0);

          if (pcs <= 0) continue;

          if (item.source === "GROCERY") {
            const product = await ProductModel.findOneAndUpdate(
              { _id: item.productId },
              { $inc: { stockPcs: pcs } },
              { new: true, session: mongoSession }
            );

            if (!product) {
              transferFail(
                404,
                `${item.productName} no longer exists. Cannot cancel this transfer.`
              );
            }

            const newStock = Number(product.stockPcs || 0);

            groceryLedger.push({
              productId: product._id,
              type: "VOID_REVERSAL",
              unit: "PCS",
              quantity: pcs,
              previousStock: newStock - pcs,
              newStock,
              remarks: `CANCEL TRANSFER ${transfer.transferNumber}`,
              referenceType: "STOCK_TRANSFER_CANCEL",
              referenceId: transfer._id,
              createdBy: session?.user?.id,
            });

            continue;
          }

          const isHeadTransfer = item.unitLabel === "HEAD";
          const product = await BodegaProductModel.findOneAndUpdate(
            { _id: item.bodegaProductId },
            {
              $inc: {
                stockQty: pcs,
                ...(isHeadTransfer
                  ? { stockHeads: Number(item.qty || 0) }
                  : {}),
              },
            },
            { new: true, session: mongoSession }
          );

          if (!product) {
            transferFail(
              404,
              `${item.productName} no longer exists. Cannot cancel this transfer.`
            );
          }

          const newStock = Number(product.stockQty || 0);

          bodegaLedger.push({
            bodegaProductId: product._id,
            type: "VOID_REVERSAL",
            quantity: pcs,
            heads: isHeadTransfer ? Number(item.qty || 0) : 0,
            pieces: isHeadTransfer ? 0 : pcs,
            previousStock: newStock - pcs,
            newStock,
            remarks: `CANCEL TRANSFER ${transfer.transferNumber}`,
            referenceType: "STOCK_TRANSFER_CANCEL",
            referenceId: transfer._id,
            createdBy: session?.user?.id,
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
      }
    });

    return NextResponse.json({
      success: true,
      message: stockRestored
        ? `Transfer ${cancelledNumber} cancelled and the dispatched stock was returned to the bodega.${linkedToSale ? " Void the linked sale if the order is also cancelled." : ""}`
        : `Transfer ${cancelledNumber} cancelled.`,
    });
  } catch (error) {
    if (error instanceof StockTransferError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error(error);

    return NextResponse.json(
      { success: false, message: "Unable to cancel stock transfer." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}

export const PATCH = withAuditLog(handlePATCH, {
  module: "STOCK_TRANSFERS",
  action: "UPDATE",
  entityType: "STOCK_TRANSFER",
});

export const DELETE = withAuditLog(handleDELETE, {
  module: "STOCK_TRANSFERS",
  action: "CANCEL",
  entityType: "STOCK_TRANSFER",
});
