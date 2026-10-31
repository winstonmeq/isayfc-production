// app/api/mobile/sales/route.ts
//
// Records a cash sale from the mobile cashier. The cart is a list of menu
// items + quantities. We total it, create the Sale (+ lines), and deduct any
// mapped raw stock from outlet inventory — all in one transaction.
//
// Cash only, walk-in by default (no customer). Inventory-backed menu items
// require enough finished stock (or enough legacy recipe-component stock)
// before the sale can be completed.

import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requireMobileAuth } from "@/lib/mobile-auth";
import {
  addDays,
  manilaDateString,
  startOfDayManila,
} from "@/lib/date-utils";
import OutletMenuItemModel from "@/models/OutletMenuItem";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import {
  packingSnapshot,
  toBaseUnitCost,
} from "@/lib/inventory-units";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";
import CashShiftModel from "@/models/CashShift";

export const dynamic = "force-dynamic";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Thrown when a concurrent request with the same idempotencyKey already won. */
class DuplicateSaleError extends Error {}

/**
 * True if a Mongo 11000 came from the idempotencyKey index (vs. receiptNumber).
 * Mongo reports the offending index in `keyPattern`/`keyValue`; fall back to the
 * error message for driver versions that don't populate them.
 */
function isKeyDuplicate(e: any): boolean {
  const pattern = e?.keyPattern;
  if (pattern && typeof pattern === "object") {
    return Object.prototype.hasOwnProperty.call(pattern, "idempotencyKey");
  }
  const value = e?.keyValue;
  if (value && typeof value === "object") {
    return Object.prototype.hasOwnProperty.call(value, "idempotencyKey");
  }
  return typeof e?.message === "string" && e.message.includes("idempotencyKey");
}

type CartLine = { menuItemId?: string; qty?: number };

async function nextReceiptNumber(): Promise<string> {
  // MOB-YYYYMMDD-NNNN per Manila day. The unique index is the real guard;
  // we retry once on duplicate.
  const datePart = manilaDateString().replaceAll("-", "");
  const prefix = `MOB-${datePart}-`;
  const latest = await SaleModel.findOne({ receiptNumber: { $regex: `^${prefix}` } })
    .sort({ receiptNumber: -1 })
    .select("receiptNumber")
    .lean<{ receiptNumber?: string }>();
  const last = latest ? Number(String(latest.receiptNumber).slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(last + 1).padStart(4, "0")}`;
}

export async function GET(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, ["sales.view", "sales.manage"]);
  if (response) return response;
  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 30), 1), 100);

  // Today's mobile sales for this outlet. Use the first-class fields written
  // by current clients, with legacy fallbacks for older rows.
  const dayStart = startOfDayManila();
  const dayEnd = addDays(dayStart, 1);
  const sales = await SaleModel.find({
    saleDate: { $gte: dayStart, $lt: dayEnd },
    $and: [
      {
        $or: [
          { outletId: user.outlet.id },
          { remarks: { $regex: `OUTLET:${user.outlet.id}` } },
        ],
      },
      {
        $or: [
          { channel: "MOBILE" },
          { receiptNumber: { $regex: "^MOB-" } },
        ],
      },
    ],
    isVoided: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  let total = 0;
  const data = (sales as any[]).map((s) => {
    total += Number(s.totalAmount || 0);
    return {
      id: s._id.toString(),
      receiptNumber: s.receiptNumber,
      totalAmount: Number(s.totalAmount || 0),
      totalQty: Number(s.totalQty || 0),
      createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : undefined,
    };
  });

  return NextResponse.json({
    success: true,
    data,
    summary: { count: data.length, total },
  });
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, "sales.manage");
  if (response) return response;

  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  await dbConnect();

  let body: {
    items?: CartLine[];
    cashReceived?: number;
    remarks?: string;
    idempotencyKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }

  const cart = Array.isArray(body?.items) ? body.items : [];
  if (cart.length === 0) {
    return NextResponse.json({ success: false, message: "Cart is empty." }, { status: 400 });
  }

  const outletId = user.outlet.id;

  // Idempotency: if the app already recorded this exact cart-confirm (same key)
  // and is just retrying after a dropped response, return the existing sale
  // instead of ringing it up twice. The unique index is the real guard; this
  // pre-check avoids the wasted work and surfaces a clean "already recorded".
  const idempotencyKey = String(body?.idempotencyKey || "").trim();
  if (idempotencyKey) {
    const existing = await SaleModel.findOne({ outletId, idempotencyKey })
      .select("receiptNumber totalAmount totalQty")
      .lean<{
        _id: { toString: () => string };
        receiptNumber?: string;
        totalAmount?: number;
        totalQty?: number;
      }>();
    if (existing) {
      const totalAmount = Number(existing.totalAmount || 0);
      const retryCash = Number(body?.cashReceived);
      const cashReceived =
        Number.isFinite(retryCash) && retryCash >= totalAmount
          ? retryCash
          : totalAmount;
      return NextResponse.json({
        success: true,
        message: "Sale already recorded.",
        duplicate: true,
        sale: {
          id: existing._id.toString(),
          receiptNumber: existing.receiptNumber,
          totalAmount,
          totalQty: Number(existing.totalQty || 0),
          cashReceived,
          change: cashReceived - totalAmount,
          warnings: [],
        },
      });
    }
  }
  const mongoSession = await mongoose.startSession();

  try {
    let result: any = null;

    await mongoSession.withTransaction(async () => {
      // 1) Load the menu items in the cart (scoped to this outlet).
      const ids = cart
        .map((c) => String(c.menuItemId || ""))
        .filter((id) => isValidObjectId(id));

      if (ids.length === 0) throw new ApiError(400, "No valid items in cart.");

      const menuItems = await OutletMenuItemModel.find({
        _id: { $in: ids },
        outletId,
        isActive: true,
      }).session(mongoSession);

      const menuById = new Map(menuItems.map((m) => [m._id.toString(), m]));

      // Production/mixing stores finished menu products in OutletInventory.
      // Prefer those finished records over the legacy direct-component recipe
      // path so selling Buttered Chicken consumes Buttered Chicken stock, not
      // C10 again after C10 was already consumed during production.
      const finishedInventories = await OutletInventoryModel.find({
        outletId,
        isActive: true,
        productId: { $in: menuItems.map((m) => m._id) },
      }).session(mongoSession);
      const finishedByMenuId = new Map(
        finishedInventories.map((inv) => [inv.productId.toString(), inv])
      );

      // 2) Build sale lines + accumulate stock deductions.
      const lines: any[] = [];
      const stockDeductions = new Map<
        string,
        {
          source: string;
          productId: string;
          outletInventoryId: string;
          qty: number;
          name: string;
        }
      >();
      let totalAmount = 0;
      let totalQty = 0;

      for (const c of cart) {
        const menu = menuById.get(String(c.menuItemId));
        if (!menu) throw new ApiError(404, "A menu item was not found or is unavailable.");

        const qty = Number(c.qty || 0);
        if (!Number.isSafeInteger(qty) || qty < 1) {
          throw new ApiError(400, `Invalid quantity for ${menu.name}.`);
        }

        const lineTotal = Number(menu.price) * qty;
        totalAmount += lineTotal;
        totalQty += qty;

        const finishedInventory =
          finishedByMenuId.get(menu._id.toString());

        if (!finishedInventory) {
          throw new ApiError(
            409,
            `${menu.name} has no finished outlet stock. Produce it through mixing before selling it.`
          );
        }

        lines.push({
          source: "OUTLET",
          outletInventoryId: finishedInventory._id,
          companyUnitCost: finishedInventory.companyUnitCost,
          menuItemId: menu._id,
          productName: menu.name,
          categoryName: menu.category,
          qty,
          price: Number(menu.price),
          lineTotal,
          unitCost: toBaseUnitCost(
            finishedInventory.buyingPrice,
            packingSnapshot({
              unit: Number(finishedInventory.packSize || 0) > 0 ? "PACK" : "QTY",
              baseUnit: "QTY",
              multiplier: finishedInventory.packSize,
            })
          ),
          stockUnit: "QTY",
          packSize: 1,
          stockPcsOut: qty,
          baseUnit: "QTY",
          baseQty: qty,
          entryUnit: "QTY",
          multiplier: 1,
          remarks: `MENU:${menu._id.toString()}`,
        });

        const key = `FINISHED:${finishedInventory._id.toString()}`;
        const existing = stockDeductions.get(key);
        if (existing) existing.qty += qty;
        else
          stockDeductions.set(key, {
            source: finishedInventory.productSource,
            productId: finishedInventory.productId.toString(),
            outletInventoryId: finishedInventory._id.toString(),
            qty,
            name: finishedInventory.productName,
          });
      }

      const cashReceived = Number(body?.cashReceived);
      if (!Number.isFinite(cashReceived) || cashReceived < totalAmount) {
        throw new ApiError(
          400,
          `Cash received must be at least ${totalAmount.toFixed(2)}.`
        );
      }

      // Claim and update the OPEN shift inside this transaction. Close-shift
      // changes OPEN -> CLOSING in its own transaction, so MongoDB makes the
      // concurrent operations conflict instead of allowing an orphaned sale.
      const openShift = await CashShiftModel.findOneAndUpdate(
        {
          cashierId: user.id,
          outletId,
          status: "OPEN",
        },
        {
          $inc: {
            cashSales: totalAmount,
            salesCount: 1,
          },
        },
        { new: true, session: mongoSession }
      );

      if (!openShift) {
        throw new ApiError(409, "Open a cash shift before recording sales.");
      }

      const shiftId = openShift._id.toString();
      const shiftTag = ` SHIFT:${shiftId}`;

      // 3) Create the sale.
      let receiptNumber = await nextReceiptNumber();
      let sale;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const [created] = await (SaleModel as any).create(
            [
              {
                receiptNumber,
                saleDate: new Date(),
                source: "OUTLET",
                // First-class fields (the remarks tag is kept for backward
                // compatibility with rows written before these existed).
                outletId,
                shiftId,
                channel: "MOBILE",
                paymentMethod: "CASH",
                cashReceived,
                change: cashReceived - totalAmount,
                idempotencyKey: idempotencyKey || undefined,
                totalAmount,
                paidAmount: totalAmount, // cash, fully paid
                balance: 0,
                totalQty,
                status: "PAID",
                remarks: `MOBILE SALE OUTLET:${outletId}${shiftTag}`,
                createdBy: user.id,
              },
            ],
            { session: mongoSession }
          );
          sale = created;
          break;
        } catch (e: any) {
          // A duplicate on the idempotencyKey index means a concurrent request
          // with the same key won the race — this is a retry, not a receipt
          // collision. Surface it so the outer catch returns the existing sale;
          // regenerating the receipt number here would just collide again.
          if (e?.code === 11000 && isKeyDuplicate(e)) {
            throw new DuplicateSaleError();
          }
          if (e?.code === 11000 && attempt === 0) {
            receiptNumber = await nextReceiptNumber();
            continue;
          }
          throw e;
        }
      }
      if (!sale) throw new ApiError(500, "Could not generate a receipt number. Try again.");

      await (SaleLineModel as any).insertMany(
        lines.map((l) => ({ ...l, saleId: sale._id })),
        { session: mongoSession }
      );

      // 4) Deduct finished stock or mapped legacy component stock. Missing or
      //    insufficient stock aborts the transaction so inventory cannot go
      //    negative and the shift/sale records remain consistent.
      const warnings: string[] = [];
      for (const dec of stockDeductions.values()) {
        const inv = await OutletInventoryModel.findOne({
          outletId,
          isActive: true,
          _id: dec.outletInventoryId,
        }).session(mongoSession);

        if (!inv) {
          throw new ApiError(
            409,
            `${dec.name || "An ingredient"} is not stocked at this outlet.`
          );
        }

        const before = Number(inv.stockQty || 0);
        const after = before - dec.qty;
        const baseUnit =
          inv.unitLabel === "HEAD"
            ? "HEAD"
            : dec.source === "GROCERY"
              ? "QTY"
              : "PCS";
        // Menu component quantities are configured in inventory base units.
        // A C10 component therefore deducts PCS even when the UI can display
        // that inventory as packs.
        const entryUnit = baseUnit;
        if (after < 0) {
          throw new ApiError(
            409,
            `${inv.productName} has only ${before} available; ${dec.qty} is required.`
          );
        }

        inv.stockQty = after;
        await inv.save({ session: mongoSession });

        await (OutletStockTransactionModel as any).create(
          [
            {
              outletId,
              outletInventoryId: inv._id,
              productSource: inv.productSource,
              productId: inv.productId,
              productName: inv.productName,
              transactionDate: new Date(),
              type: "SALE",
              quantity: dec.qty,
              entryUnit,
              entryQty: dec.qty,
              multiplier: 1,
              baseUnit,
              unitCost: toBaseUnitCost(
                inv.buyingPrice,
                packingSnapshot({
                  unit: Number(inv.packSize || 0) > 0 ? "PACK" : entryUnit,
                  baseUnit,
                  multiplier: inv.packSize,
                })
              ),
              previousStock: before,
              newStock: after,
              referenceType: "MOBILE_SALE",
              referenceId: sale._id,
              sourceChannel: "FLUTTER",
              remarks: `SALE ${receiptNumber}`,
              createdBy: user.id,
            },
          ],
          { session: mongoSession }
        );
      }

      result = {
        id: sale._id.toString(),
        receiptNumber,
        totalAmount,
        totalQty,
        cashReceived,
        change: cashReceived > totalAmount ? cashReceived - totalAmount : 0,
        warnings,
      };
    });

    return NextResponse.json({ success: true, message: "Sale recorded.", sale: result });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    // A concurrent request with the same key already created the sale (the
    // transaction above rolled back). Return that winning sale, not an error.
    if (error instanceof DuplicateSaleError && idempotencyKey) {
      const existing = await SaleModel.findOne({ outletId, idempotencyKey })
        .select("receiptNumber totalAmount totalQty")
        .lean<{
          _id: { toString: () => string };
          receiptNumber?: string;
          totalAmount?: number;
          totalQty?: number;
        }>();
      if (existing) {
        const totalAmount = Number(existing.totalAmount || 0);
        const retryCash = Number(body?.cashReceived);
        const cashReceived =
          Number.isFinite(retryCash) && retryCash >= totalAmount
            ? retryCash
            : totalAmount;
        return NextResponse.json({
          success: true,
          message: "Sale already recorded.",
          duplicate: true,
          sale: {
            id: existing._id.toString(),
            receiptNumber: existing.receiptNumber,
            totalAmount,
            totalQty: Number(existing.totalQty || 0),
            cashReceived,
            change: cashReceived - totalAmount,
            warnings: [],
          },
        });
      }
    }
    console.error(error);
    return NextResponse.json({ success: false, message: "Unable to record the sale." }, { status: 500 });
  } finally {
    await mongoSession.endSession();
  }
}
