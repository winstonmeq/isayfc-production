import mongoose, { isValidObjectId } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

import connectDb from "@/lib/mongodb";
import { requireMobileAuth } from "@/lib/mobile-auth";
import CashShiftModel from "@/models/CashShift";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import SaleModel from "@/models/Sale";

export const dynamic = "force-dynamic";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireMobileAuth(req, "sales.manage");
  if (response) return response;
  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "No outlet assigned." },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid sale ID." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const reason = String(body?.reason || "").trim();
  if (reason.length < 5) {
    return NextResponse.json(
      {
        success: false,
        message: "Enter a void reason of at least 5 characters.",
      },
      { status: 400 }
    );
  }

  await connectDb();
  const mongoSession = await mongoose.startSession();

  try {
    let receiptNumber = "";

    await mongoSession.withTransaction(async () => {
      const existing = await SaleModel.findOne({
        _id: id,
        outletId: user.outlet!.id,
        channel: "MOBILE",
      })
        .select("shiftId isVoided receiptNumber totalAmount")
        .session(mongoSession);

      if (!existing) throw new ApiError(404, "Sale not found.");
      if (existing.isVoided) throw new ApiError(400, "Sale is already voided.");
      if (!existing.shiftId) {
        throw new ApiError(400, "This sale is not linked to a cash shift.");
      }

      // Do not rewrite a drawer that has already been counted and closed.
      const shift = await CashShiftModel.findOneAndUpdate(
        {
          _id: existing.shiftId,
          cashierId: user.id,
          outletId: user.outlet!.id,
          status: "OPEN",
        },
        {
          $inc: {
            cashSales: -Number(existing.totalAmount || 0),
            salesCount: -1,
          },
        },
        { new: true, session: mongoSession }
      );
      if (!shift) {
        throw new ApiError(
          409,
          "Only sales from your currently open shift can be voided."
        );
      }

      const sale = await SaleModel.findOneAndUpdate(
        { _id: existing._id, isVoided: false },
        {
          $set: {
            isVoided: true,
            status: "VOIDED",
            balance: 0,
            remarks: `${existing.receiptNumber} VOID: ${reason}`,
          },
        },
        { new: true, session: mongoSession }
      );
      if (!sale) throw new ApiError(400, "Sale is already voided.");
      receiptNumber = sale.receiptNumber;

      const movements = await OutletStockTransactionModel.find({
        outletId: user.outlet!.id,
        referenceType: "MOBILE_SALE",
        referenceId: sale._id,
        type: "SALE",
      }).session(mongoSession);

      for (const movement of movements) {
        const inventory = await OutletInventoryModel.findOneAndUpdate(
          {
            _id: movement.outletInventoryId,
            outletId: user.outlet!.id,
            isActive: true,
          },
          { $inc: { stockQty: Number(movement.quantity || 0) } },
          { new: true, session: mongoSession }
        );
        if (!inventory) {
          throw new ApiError(
            409,
            `Cannot restore ${movement.productName}; its inventory record is unavailable.`
          );
        }

        const newStock = Number(inventory.stockQty || 0);
        const restored = Number(movement.quantity || 0);
        await OutletStockTransactionModel.create(
          [
            {
              outletId: movement.outletId,
              outletInventoryId: inventory._id,
              productSource: movement.productSource,
              productId: movement.productId,
              productName: movement.productName,
              transactionDate: new Date(),
              type: "VOID",
              quantity: restored,
              unitCost: Number(movement.unitCost || 0),
              entryUnit: movement.entryUnit,
              entryQty: Number(movement.entryQty || restored),
              multiplier: Number(movement.multiplier || 1),
              baseUnit: movement.baseUnit,
              previousStock: newStock - restored,
              newStock,
              referenceType: "MOBILE_SALE_VOID",
              referenceId: sale._id,
              sourceChannel: "FLUTTER",
              remarks: `VOID ${receiptNumber}: ${reason}`,
              createdBy: user.id,
            },
          ],
          { session: mongoSession }
        );
      }
    });

    return NextResponse.json({
      success: true,
      message: `Sale ${receiptNumber} voided and stock restored.`,
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
      { success: false, message: "Unable to void the sale." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}
