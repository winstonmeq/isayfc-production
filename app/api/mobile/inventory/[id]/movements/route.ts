import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import connectDb from "@/lib/mongodb";
import { requireMobileAuth } from "@/lib/mobile-auth";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireMobileAuth(req, [
    "pos.view",
    "pos.manage",
    "outlet-inventory.view",
    "sales.view",
  ]);
  if (response) return response;

  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your outlet is inactive or not assigned." },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid inventory product." },
      { status: 400 }
    );
  }

  await connectDb();

  const inventory = await OutletInventoryModel.findOne({
    _id: id,
    outletId: user.outlet.id,
    isActive: true,
  })
    .select("productName stockQty unitLabel packSize")
    .lean();

  if (!inventory) {
    return NextResponse.json(
      { success: false, message: "Inventory product not found." },
      { status: 404 }
    );
  }

  const movements = await OutletStockTransactionModel.find({
    outletId: user.outlet.id,
    outletInventoryId: id,
  })
    .sort({ transactionDate: -1, createdAt: -1 })
    .limit(100)
    .lean();

  return NextResponse.json({
    success: true,
    product: {
      id: inventory._id.toString(),
      productName: inventory.productName || "",
      stockQty: Number(inventory.stockQty || 0),
      unitLabel: inventory.unitLabel || "QTY",
      packSize: Number(inventory.packSize || 0),
    },
    data: movements.map((movement) => ({
      id: movement._id.toString(),
      transactionDate: movement.transactionDate
        ? new Date(movement.transactionDate).toISOString()
        : null,
      type: movement.type,
      quantity: Number(movement.quantity || 0),
      entryQty: Number(movement.entryQty || movement.quantity || 0),
      entryUnit: movement.entryUnit || movement.baseUnit || "QTY",
      previousStock: Number(movement.previousStock || 0),
      newStock: Number(movement.newStock || 0),
      remarks: movement.remarks || "",
      sourceChannel: movement.sourceChannel || "SYSTEM",
    })),
  });
}
