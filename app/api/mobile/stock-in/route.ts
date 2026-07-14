// app/api/mobile/stock-in/route.ts
//
// Outlet "Receive Stock" for products that did NOT come through a stock
// transfer from the main branch — e.g. the outlet buys Coke from another store
// and sells it. Without this, those sales drive outlet stock negative because
// no stock was ever added for them.
//
// Adds quantity to an outlet-inventory item (creating it if new), recording
// what the outlet paid (buyingPrice) so profit/COGS stay correct, and writes a
// STOCK_IN ledger row tagged OUTSIDE_PURCHASE.

import { NextRequest, NextResponse } from "next/server";
import mongoose, { Types, isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { startOfDayManila, addDays } from "@/lib/date-utils";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";

export const dynamic = "force-dynamic";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const VALID_UNITS = ["PCS", "PACK", "QTY", "KG", "BAG"] as const;
function normalizeUnit(value: unknown): (typeof VALID_UNITS)[number] {
  const u = String(value || "").toUpperCase();
  return (VALID_UNITS as readonly string[]).includes(u)
    ? (u as (typeof VALID_UNITS)[number])
    : "QTY";
}

export async function GET(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, [
    "outlet-inventory.manage",
    "outlet-inventory.view",
  ]);
  if (response) return response;

  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 200);

  // Today's outside-purchase stock-ins for this outlet. startOfDayManila gives
  // the true Manila midnight regardless of the server's timezone.
  const dayStart = startOfDayManila();
  const dayEnd = addDays(dayStart, 1);

  const rows = await OutletStockTransactionModel.find({
    outletId: user.outlet.id,
    type: "STOCK_IN",
    referenceType: "OUTSIDE_PURCHASE",
    transactionDate: { $gte: dayStart, $lt: dayEnd },
  })
    .sort({ transactionDate: -1, _id: -1 })
    .limit(limit)
    .lean();

  const data = (rows as any[]).map((r) => ({
    id: r._id.toString(),
    productName: r.productName || "",
    quantity: Number(r.quantity || 0),
    newStock: Number(r.newStock || 0),
    transactionDate: r.transactionDate
      ? new Date(r.transactionDate).toISOString()
      : undefined,
  }));

  return NextResponse.json({ success: true, outlet: user.outlet, data });
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, "outlet-inventory.manage");
  if (response) return response;

  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  await dbConnect();

  let body: {
    inventoryId?: string;
    productName?: string;
    categoryName?: string;
    productSource?: "BODEGA" | "GROCERY";
    unitLabel?: string;
    packSize?: number;
    qty?: number;
    buyingPrice?: number;
    sellingPrice?: number;
    remarks?: string;
    idempotencyKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body." },
      { status: 400 }
    );
  }

  const outletId = user.outlet.id;
  const inventoryId = String(body?.inventoryId || "").trim();
  const qty = Math.trunc(Number(body?.qty || 0));
  const buyingPrice = Math.max(0, Number(body?.buyingPrice || 0));
  const sellingPrice = Math.max(0, Number(body?.sellingPrice || 0));
  const idempotencyKey = String(body?.idempotencyKey || "").trim();

  if (!Number.isFinite(qty) || qty < 1) {
    return NextResponse.json(
      { success: false, message: "Quantity must be a whole number of at least 1." },
      { status: 400 }
    );
  }

  const usingExisting = inventoryId.length > 0;
  if (usingExisting && !isValidObjectId(inventoryId)) {
    return NextResponse.json(
      { success: false, message: "Invalid product selected." },
      { status: 400 }
    );
  }

  const productName = String(body?.productName || "").trim().toUpperCase();
  if (!usingExisting && !productName) {
    return NextResponse.json(
      { success: false, message: "Enter a product name." },
      { status: 400 }
    );
  }

  // Idempotency: a retried request must not add stock twice. Pre-check by the
  // indexed first-class field; the partial unique index on
  // {outletId, idempotencyKey} is the real guard against a concurrent retry.
  if (idempotencyKey) {
    const existing = await findExistingStockIn(outletId, idempotencyKey);
    if (existing) return existing;
  }

  const mongoSession = await mongoose.startSession();

  try {
    let result: any = null;

    await mongoSession.withTransaction(async () => {
      const now = new Date();

      let inv: any;

      if (usingExisting) {
        inv = await OutletInventoryModel.findOne({
          _id: inventoryId,
          outletId,
          isActive: true,
        }).session(mongoSession);
        if (!inv) {
          throw new ApiError(404, "That product is not stocked at this outlet.");
        }
        // Refresh prices if the outlet provided new ones (a later batch may cost
        // more); otherwise keep the existing prices.
        if (buyingPrice > 0) inv.buyingPrice = buyingPrice;
        if (sellingPrice > 0) inv.sellingPrice = sellingPrice;
      } else {
        const productSource = body.productSource === "GROCERY" ? "GROCERY" : "BODEGA";
        // Outside-sourced products have no main-system id; mint a derived one.
        const productId = new Types.ObjectId();

        inv = await (OutletInventoryModel as any).create(
          [
            {
              outletId,
              productSource,
              productId,
              productName,
              categoryName: String(body.categoryName || "").trim().toUpperCase(),
              stockQty: 0,
              unitLabel: normalizeUnit(body.unitLabel),
              packSize: Math.max(0, Math.trunc(Number(body.packSize || 0))),
              lowStockAlert: 0,
              buyingPrice,
              sellingPrice,
              isActive: true,
              createdBy: new Types.ObjectId(user.id),
            },
          ],
          { session: mongoSession }
        ).then((rows: any[]) => rows[0]);
      }

      const before = Number(inv.stockQty || 0);
      const after = before + qty;

      inv.stockQty = after;
      inv.updatedBy = new Types.ObjectId(user.id);
      await inv.save({ session: mongoSession });

      // Snapshots record TRUE values (can be negative) so
      // newStock - previousStock always equals quantity for reconciliation.
      const [ledger] = await (OutletStockTransactionModel as any).create(
        [
          {
            outletId,
            outletInventoryId: inv._id,
            productSource: inv.productSource,
            productId: inv.productId,
            productName: inv.productName,
            transactionDate: now,
            type: "STOCK_IN",
            quantity: qty,
            previousStock: before,
            newStock: after,
            referenceType: "OUTSIDE_PURCHASE",
            sourceChannel: "FLUTTER",
            idempotencyKey: idempotencyKey || undefined,
            remarks: "OUTSIDE PURCHASE",
            createdBy: user.id,
          },
        ],
        { session: mongoSession }
      );

      result = {
        id: ledger._id.toString(),
        inventoryId: inv._id.toString(),
        productName: inv.productName,
        quantity: qty,
        newStock: after,
        buyingPrice: Number(inv.buyingPrice || 0),
        sellingPrice: Number(inv.sellingPrice || 0),
      };
    });

    return NextResponse.json({
      success: true,
      message: "Stock received.",
      stockIn: result,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    // A concurrent request with the same key won the unique-index race (this
    // transaction rolled back). Return the winning stock-in, not an error.
    if (isIdempotencyDuplicate(error) && idempotencyKey) {
      const existing = await findExistingStockIn(outletId, idempotencyKey);
      if (existing) return existing;
    }
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Unable to record the stock-in." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}

/** True if a Mongo E11000 came from the ledger idempotencyKey index. */
function isIdempotencyDuplicate(e: any): boolean {
  if (e?.code !== 11000) return false;
  const pattern = e?.keyPattern;
  if (pattern && typeof pattern === "object") {
    return Object.prototype.hasOwnProperty.call(pattern, "idempotencyKey");
  }
  return typeof e?.message === "string" && e.message.includes("idempotencyKey");
}

/**
 * Duplicate response for an already-recorded stock-in (indexed field lookup),
 * or null when no prior stock-in carries this key.
 */
async function findExistingStockIn(outletId: string, idempotencyKey: string) {
  const existing = await OutletStockTransactionModel.findOne({
    outletId,
    idempotencyKey,
  })
    .select("_id productName newStock")
    .lean<{ _id: { toString: () => string }; productName?: string; newStock?: number }>();

  if (!existing) return null;

  return NextResponse.json({
    success: true,
    message: "Stock-in already recorded.",
    duplicate: true,
    stockIn: {
      id: existing._id.toString(),
      productName: existing.productName,
      newStock: Number(existing.newStock || 0),
    },
  });
}
