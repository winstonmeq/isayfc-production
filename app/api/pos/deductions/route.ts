import { NextRequest, NextResponse } from "next/server";
import mongoose, { Types, isValidObjectId } from "mongoose";

import { packingSnapshot, toBaseQuantity, toBaseUnitCost } from "@/lib/inventory-units";
import dbConnect from "@/lib/mongodb";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { requirePermission } from "@/lib/require-permission";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";

export const dynamic = "force-dynamic";

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function POST(req: NextRequest) {
  const { session, response } = await requirePermission("pos.deductions.manage");
  if (response) return response;
  await dbConnect();

  const body = await req.json().catch(() => null) as null | {
    outletId?: string; inventoryId?: string; qty?: number; unit?: string; remarks?: string;
  };
  const outletId = String(body?.outletId || "");
  const inventoryId = String(body?.inventoryId || "");
  const enteredQty = Number(body?.qty);
  const requestedUnit = String(body?.unit || "").toUpperCase();
  const notes = String(body?.remarks || "").trim();

  if (!isValidObjectId(outletId) || !(await findAuthorizedPosOutlet(session!.user.id, outletId))) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }
  if (!isValidObjectId(inventoryId) || !Number.isInteger(enteredQty) || enteredQty < 1) {
    return NextResponse.json({ success: false, message: "Select a product and enter a whole quantity of at least 1." }, { status: 400 });
  }
  if (notes.length < 3) {
    return NextResponse.json({ success: false, message: "Enter a reason for the manual stock deduction." }, { status: 400 });
  }

  const mongoSession = await mongoose.startSession();
  try {
    let result: { productName: string; newStock: number } | null = null;
    await mongoSession.withTransaction(async () => {
      const current = await OutletInventoryModel.findOne({ _id: inventoryId, outletId, isActive: true }).session(mongoSession);
      if (!current) throw new ApiError(404, "The selected outlet stock no longer exists.");

      const hasPacking = Number(current.packSize || 0) > 0;
      const entryUnit = requestedUnit === "PACK" && hasPacking
        ? "PACK"
        : current.unitLabel === "KG" ? "KG" : current.unitLabel === "QTY" ? "QTY" : current.unitLabel === "HEAD" ? "HEAD" : "PCS";
      const baseUnit = entryUnit === "KG" ? "KG" : entryUnit === "QTY" ? "QTY" : entryUnit === "HEAD" ? "HEAD" : "PCS";
      const packing = packingSnapshot({ unit: entryUnit, baseUnit, multiplier: current.packSize });
      const baseQty = toBaseQuantity(enteredQty, packing);

      const inventory = await OutletInventoryModel.findOneAndUpdate(
        { _id: inventoryId, outletId, isActive: true, stockQty: { $gte: baseQty } },
        { $inc: { stockQty: -baseQty }, $set: { updatedBy: session!.user.id } },
        { new: true, session: mongoSession }
      );
      if (!inventory) throw new ApiError(400, `${current.productName} only has ${Number(current.stockQty || 0)} base units available.`);

      const newStock = Number(inventory.stockQty || 0);
      await OutletStockTransactionModel.create([{
        outletId: inventory.outletId,
        outletInventoryId: inventory._id,
        productSource: inventory.productSource,
        productId: inventory.productId,
        productName: inventory.productName,
        transactionDate: new Date(),
        type: "STOCK_OUT",
        quantity: baseQty,
        unitCost: toBaseUnitCost(inventory.buyingPrice, packingSnapshot({ unit: hasPacking ? "PACK" : baseUnit, baseUnit, multiplier: inventory.packSize })),
        entryUnit,
        entryQty: enteredQty,
        multiplier: packing.multiplier,
        baseUnit,
        previousStock: newStock + baseQty,
        newStock,
        referenceType: "INVENTORY_DEDUCTION",
        referenceId: new Types.ObjectId(),
        sourceChannel: "WEB",
        remarks: `INVENTORY DEDUCTION: ${notes}`,
        createdBy: session!.user.id,
      }], { session: mongoSession });
      result = { productName: inventory.productName, newStock };
    });
    return NextResponse.json({ success: true, message: `${result!.productName} stock deduction saved.`, data: result });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ success: false, message: "Unable to save the stock deduction." }, { status: 500 });
  } finally {
    await mongoSession.endSession();
  }
}
