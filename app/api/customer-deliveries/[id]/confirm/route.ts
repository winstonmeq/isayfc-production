import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { serializeCustomerDelivery } from "@/lib/customer-delivery-utils";
import AuditLogModel from "@/models/AuditLog";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import CustomerDeliveryModel from "@/models/CustomerDelivery";
import CustomerDeliveryItemModel from "@/models/CustomerDeliveryItem";
import CustomerInventoryModel from "@/models/CustomerInventory";
import CustomerInventoryTransactionModel from "@/models/CustomerInventoryTransaction";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import ProductModel from "@/models/Product";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}

function makeUserObjectId(value?: string) {
  return value && isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : undefined;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function addToOutletInventory({
  delivery,
  item,
  quantity,
  sourceProduct,
  session,
  userId,
}: {
  delivery: any;
  item: any;
  quantity: number;
  sourceProduct: any;
  session: mongoose.ClientSession;
  userId?: string;
}) {
  if (!delivery.outletId) return;

  const productId = item.source === "BODEGA" ? item.bodegaProductId : item.productId;

  if (!productId) {
    fail(400, `Missing product reference for ${item.productName}.`);
  }

  const outletInventory = await OutletInventoryModel.findOneAndUpdate(
    {
      outletId: delivery.outletId,
      productSource: item.source,
      productId,
      isActive: true,
    },
    {
      $setOnInsert: {
        outletId: delivery.outletId,
        productSource: item.source,
        productId,
        productName: item.productName,
        categoryName: item.categoryName,
        unitLabel: item.source === "BODEGA" && numberValue(item.packSize) > 0 ? "PCS" : "QTY",
        lowStockAlert: numberValue(sourceProduct?.lowStockAlert),
        createdBy: makeUserObjectId(userId),
        isActive: true,
      },
      $set: {
        productName: item.productName,
        categoryName: item.categoryName,
        packSize: numberValue(item.packSize),
        buyingPrice: numberValue(sourceProduct?.buyingPrice),
        sellingPrice: item.source === "BODEGA" ? numberValue(sourceProduct?.sellingPrice) : numberValue(sourceProduct?.unitPrice),
        updatedBy: makeUserObjectId(userId),
      },
      $inc: { stockQty: quantity },
    },
    { new: true, upsert: true, session }
  );

  const newStock = numberValue(outletInventory.stockQty);
  const previousStock = newStock - quantity;

  await OutletStockTransactionModel.create(
    [
      {
        outletId: delivery.outletId,
        outletInventoryId: outletInventory._id,
        productSource: item.source,
        productId,
        productName: item.productName,
        transactionDate: new Date(),
        type: "DELIVERY_RECEIVED",
        quantity,
        previousStock,
        newStock,
        referenceType: "CUSTOMER_DELIVERY",
        referenceId: delivery._id,
        sourceChannel: "WEB",
        remarks: `DELIVERY RECEIVED ${delivery.deliveryCode}`,
        createdBy: makeUserObjectId(userId),
      },
    ],
    { session }
  );
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session: authSession } = await requirePermission(
    "customer-deliveries.manage"
  );
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid customer delivery ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const mongoSession = await mongoose.startSession();

  try {
    let confirmedDeliveryId: mongoose.Types.ObjectId | null = null;

    await mongoSession.withTransaction(async () => {
      const delivery = await CustomerDeliveryModel.findOne({
        _id: id,
        isActive: true,
      }).session(mongoSession);

      if (!delivery) {
        fail(404, "Customer delivery not found.");
      }

      if (delivery.outletId) {
        fail(
          400,
          "This legacy outlet delivery cannot be confirmed. Create a main sale linked to the outlet and use its stock transfer instead."
        );
      }

      if (delivery.status !== "PENDING") {
        fail(400, "Only pending customer deliveries can be confirmed.");
      }

      const items = await CustomerDeliveryItemModel.find({
        customerDeliveryId: delivery._id,
      }).session(mongoSession);

      if (items.length === 0) {
        fail(400, "Customer delivery has no items to confirm.");
      }

      const customerInventoryTransactions = [];
      const bodegaStockTransactions = [];
      const productInventoryTransactions = [];
      const auditLogs = [];
      const transactionDate = new Date();

      for (const item of items) {
        const stockQtyOut = Number(item.stockPcsOut || 0);

        if (stockQtyOut <= 0) {
          fail(400, `Invalid stock quantity for ${item.productName}.`);
        }

        let sourceProduct: any = null;

        if (item.source === "BODEGA") {
          const updatedProduct = await BodegaProductModel.findOneAndUpdate(
            {
              _id: item.bodegaProductId,
              isActive: true,
              stockQty: { $gte: stockQtyOut },
            },
            {
              $inc: { stockQty: -stockQtyOut },
            },
            { new: true, session: mongoSession }
          );

          if (!updatedProduct) {
            fail(400, `Not enough bodega stock for ${item.productName}.`);
          }

          sourceProduct = updatedProduct;
          const newStock = Number(updatedProduct.stockQty || 0);
          const previousStock = newStock + stockQtyOut;

          bodegaStockTransactions.push({
            bodegaProductId: item.bodegaProductId,
            transactionDate,
            type: "CUSTOMER_DELIVERY",
            quantity: stockQtyOut,
            previousStock,
            newStock,
            remarks: `CUSTOMER DELIVERY ${delivery.deliveryCode}`,
            referenceType: "CUSTOMER_DELIVERY",
            referenceId: delivery._id,
            createdBy: authSession?.user?.id,
          });
        }

        if (item.source === "GROCERY") {
          const updatedProduct = await ProductModel.findOneAndUpdate(
            {
              _id: item.productId,
              isActive: true,
              stockPcs: { $gte: stockQtyOut },
            },
            {
              $inc: { stockPcs: -stockQtyOut },
            },
            { new: true, session: mongoSession }
          );

          if (!updatedProduct) {
            fail(400, `Not enough grocery/product stock for ${item.productName}.`);
          }

          sourceProduct = updatedProduct;
          const newStock = Number(updatedProduct.stockPcs || 0);
          const previousStock = newStock + stockQtyOut;

          productInventoryTransactions.push({
            productId: item.productId,
            transactionDate,
            type: "CUSTOMER_DELIVERY",
            unit: "PCS",
            quantity: stockQtyOut,
            previousStock,
            newStock,
            remarks: `CUSTOMER DELIVERY ${delivery.deliveryCode}`,
            referenceType: "CUSTOMER_DELIVERY",
            referenceId: delivery._id,
            createdBy: authSession?.user?.id,
          });
        }

        if (delivery.outletId) {
          await addToOutletInventory({
            delivery,
            item,
            quantity: stockQtyOut,
            sourceProduct,
            session: mongoSession,
            userId: authSession?.user?.id,
          });
        }

        const inventoryFilter: Record<string, unknown> = {
          customerId: delivery.customerId,
          source: item.source,
          isActive: true,
        };

        if (item.source === "BODEGA") {
          inventoryFilter.bodegaProductId = item.bodegaProductId;
        } else {
          inventoryFilter.productId = item.productId;
        }

        const customerInventory = await CustomerInventoryModel.findOneAndUpdate(
          inventoryFilter,
          {
            $setOnInsert: {
              customerId: delivery.customerId,
              source: item.source,
              productId: item.productId,
              bodegaProductId: item.bodegaProductId,
              categoryName: item.categoryName,
              productName: item.productName,
              stockUnit: item.stockUnit,
              packSize: item.packSize,
              isActive: true,
            },
            $set: {
              categoryName: item.categoryName,
              productName: item.productName,
              stockUnit: item.stockUnit,
              packSize: item.packSize,
              lastDeliveryAt: new Date(),
            },
            $inc: { stockQty: stockQtyOut },
          },
          { new: true, upsert: true, session: mongoSession }
        );

        const newCustomerStock = Number(customerInventory.stockQty || 0);
        const previousCustomerStock = newCustomerStock - stockQtyOut;

        customerInventoryTransactions.push({
          customerInventoryId: customerInventory._id,
          customerId: delivery.customerId,
          transactionDate,
          type: "DELIVERY_IN",
          quantity: stockQtyOut,
          previousStock: previousCustomerStock,
          newStock: newCustomerStock,
          referenceType: "CUSTOMER_DELIVERY",
          referenceId: delivery._id,
          remarks: `CUSTOMER DELIVERY ${delivery.deliveryCode}`,
          createdBy: authSession?.user?.id,
        });
      }

      if (bodegaStockTransactions.length > 0) {
        await BodegaStockTransactionModel.insertMany(bodegaStockTransactions, {
          session: mongoSession,
        });
      }

      if (productInventoryTransactions.length > 0) {
        await InventoryTransactionModel.insertMany(productInventoryTransactions, {
          session: mongoSession,
        });
      }

      if (customerInventoryTransactions.length > 0) {
        await CustomerInventoryTransactionModel.insertMany(
          customerInventoryTransactions,
          { session: mongoSession }
        );
      }

      auditLogs.push({
        outletId: delivery.outletId || undefined,
        module: "CUSTOMER_DELIVERIES",
        action: "CONFIRM_DELIVERY",
        entityType: "CUSTOMER_DELIVERY",
        entityId: delivery._id,
        newValue: {
          deliveryCode: delivery.deliveryCode,
          customerId: delivery.customerId,
          outletId: delivery.outletId || undefined,
          totalItems: delivery.totalItems,
          totalQty: delivery.totalQty,
          totalAmount: delivery.totalAmount,
        },
        remarks: delivery.outletId
          ? `CONFIRMED DELIVERY ${delivery.deliveryCode} AND ADDED STOCK TO OUTLET INVENTORY`
          : `CONFIRMED DELIVERY ${delivery.deliveryCode}`,
        sourceChannel: "WEB",
        createdBy: makeUserObjectId(authSession?.user?.id),
      });

      if (auditLogs.length > 0) {
        await AuditLogModel.insertMany(auditLogs, { session: mongoSession });
      }

      delivery.status = "CONFIRMED";
      delivery.confirmedAt = new Date();
      delivery.confirmedBy = makeUserObjectId(authSession?.user?.id);
      await delivery.save({ session: mongoSession });
      confirmedDeliveryId = delivery._id;
    });

    const confirmedDelivery = await CustomerDeliveryModel.findById(confirmedDeliveryId)
      .populate("customerId", "name phone address type")
      .populate("outletId", "name code address")
      .lean();

    return NextResponse.json({
      success: true,
      message: confirmedDelivery?.outletId
        ? "Customer delivery confirmed and added to outlet inventory."
        : "Customer delivery confirmed and added to customer inventory.",
      data: serializeCustomerDelivery(confirmedDelivery),
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
      { success: false, message: "Unable to confirm customer delivery." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}
