import { NextRequest, NextResponse } from "next/server";
import mongoose, { Types, isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requireMobileAuth } from "@/lib/mobile-auth";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import {
  packingSnapshot,
  toBaseQuantity,
  toBaseUnitCost,
} from "@/lib/inventory-units";

export const dynamic = "force-dynamic";

type DeductionInput = {
  inventoryId?: string;
  qty?: number;
  unit?: string;
};

const DEDUCTION_REASONS = {
  INVENTORY_DEDUCTION: "INVENTORY DEDUCTION",
} as const;

type DeductionReason = keyof typeof DEDUCTION_REASONS;

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function GET(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, [
    "pos.view",
    "pos.manage",
    "outlet-inventory.manage",
    "outlet-inventory.view",
    "sales.manage",
  ]);
  if (response) return response;

  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  await dbConnect();

  const inventory = await OutletInventoryModel.find({
    outletId: user.outlet.id,
    isActive: true,
  })
    .select(
      "productName categoryName productSource stockQty unitLabel packSize"
    )
    .sort({ productName: 1 })
    .lean();

  return NextResponse.json({
    success: true,
    outlet: user.outlet,
    data: inventory.map((item) => ({
      id: item._id.toString(),
      productName: item.productName || "",
      categoryName: item.categoryName || "",
      productSource: item.productSource,
      stockQty: Number(item.stockQty || 0),
      unitLabel: item.unitLabel || "QTY",
      packSize: Number(item.packSize || 0),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, [
    "pos.manage",
    "outlet-inventory.manage",
    "sales.manage",
  ]);
  if (response) return response;

  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  let body: {
    items?: DeductionInput[];
    reasonCode?: string;
    remarks?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body." },
      { status: 400 }
    );
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const reasonCode = String(body.reasonCode || "").trim().toUpperCase();
  if (!(reasonCode in DEDUCTION_REASONS)) {
    return NextResponse.json(
      { success: false, message: "Select a valid stock reduction reason." },
      { status: 400 }
    );
  }
  const reason = DEDUCTION_REASONS[reasonCode as DeductionReason];
  const notes = String(body.remarks || "").trim().toUpperCase();
  const remarks = notes ? `${reason}: ${notes}` : reason;

  if (rawItems.length === 0) {
    return NextResponse.json(
      { success: false, message: "Enter a deduction for at least one product." },
      { status: 400 }
    );
  }

  if (rawItems.length > 200) {
    return NextResponse.json(
      { success: false, message: "Too many products in one deduction." },
      { status: 400 }
    );
  }

  const seen = new Set<string>();
  let items: Array<{
    inventoryId: string;
    enteredQty: number;
    requestedUnit: string;
  }>;
  try {
    items = rawItems.map((item) => {
      const inventoryId = String(item.inventoryId || "").trim();
      const qty = Number(item.qty);
      const requestedUnit = String(item.unit || "").trim().toUpperCase();

      if (!isValidObjectId(inventoryId)) {
        throw new ApiError(
          400,
          "One of the selected inventory products is invalid."
        );
      }
      if (seen.has(inventoryId)) {
        throw new ApiError(
          400,
          "The same inventory product was entered more than once."
        );
      }
      seen.add(inventoryId);

      if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 1) {
        throw new ApiError(
          400,
          "Every deduction must be a whole number of at least 1."
        );
      }

      return { inventoryId, enteredQty: qty, requestedUnit };
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    throw error;
  }

  await dbConnect();
  const mongoSession = await mongoose.startSession();

  try {
    const results: Array<{
      inventoryId: string;
      productName: string;
      quantity: number;
      newStock: number;
    }> = [];
    const referenceId = new Types.ObjectId();

    await mongoSession.withTransaction(async () => {
      for (const item of items) {
        const currentInventory = await OutletInventoryModel.findOne({
          _id: item.inventoryId,
          outletId: user.outlet!.id,
          isActive: true,
        }).session(mongoSession);

        if (!currentInventory) {
          throw new ApiError(
            404,
            "One of the inventory products is no longer available."
          );
        }

        const hasPacking = Number(currentInventory.packSize || 0) > 0;
        const entryUnit =
          item.requestedUnit === "PACK" && hasPacking
            ? "PACK"
            : item.requestedUnit === "BAG" && hasPacking
              ? "BAG"
              : currentInventory.unitLabel === "KG"
                ? "KG"
                : currentInventory.unitLabel === "QTY"
                  ? "QTY"
                  : "PCS";
        const packing = packingSnapshot({
          unit: entryUnit,
          baseUnit: entryUnit === "KG" ? "KG" : entryUnit === "QTY" ? "QTY" : "PCS",
          multiplier: currentInventory.packSize,
        });
        const baseQty = toBaseQuantity(item.enteredQty, packing);

        const inventory = await OutletInventoryModel.findOneAndUpdate(
          {
            _id: item.inventoryId,
            outletId: user.outlet!.id,
            isActive: true,
            stockQty: { $gte: baseQty },
          },
          { $inc: { stockQty: -baseQty } },
          { new: true, session: mongoSession }
        );

        if (!inventory) {
          const current = await OutletInventoryModel.findOne({
            _id: item.inventoryId,
            outletId: user.outlet!.id,
            isActive: true,
          })
            .select("productName stockQty")
            .session(mongoSession)
            .lean();

          if (!current) {
            throw new ApiError(
              404,
              "One of the inventory products is no longer available."
            );
          }

          throw new ApiError(
            400,
            `${current.productName} only has ${Number(current.stockQty || 0)} available.`
          );
        }

        const newStock = Number(inventory.stockQty || 0);

        await OutletStockTransactionModel.create(
          [
            {
              outletId: user.outlet!.id,
              outletInventoryId: inventory._id,
              productSource: inventory.productSource,
              productId: inventory.productId,
              productName: inventory.productName,
              transactionDate: new Date(),
              type: "STOCK_OUT",
              quantity: baseQty,
              entryUnit,
              entryQty: item.enteredQty,
              multiplier: packing.multiplier,
              baseUnit: packing.baseUnit,
              unitCost: toBaseUnitCost(
                inventory.buyingPrice,
                packingSnapshot({
                  unit:
                    Number(inventory.packSize || 0) > 0 ? "PACK" : "QTY",
                  baseUnit: "PCS",
                  multiplier: inventory.packSize,
                })
              ),
              previousStock: newStock + baseQty,
              newStock,
              referenceType: reasonCode,
              referenceId,
              sourceChannel: "FLUTTER",
              remarks,
              createdBy: new Types.ObjectId(user.id),
            },
          ],
          { session: mongoSession }
        );

        results.push({
          inventoryId: inventory._id.toString(),
          productName: inventory.productName,
          quantity: baseQty,
          newStock,
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: "Stock reduction saved.",
      data: results,
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
      { success: false, message: "Unable to save the stock reduction." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}
