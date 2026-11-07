// app/api/mobile/repack/route.ts
//
// Repack / break-bulk for the mobile cashier. A SOURCE outlet-inventory item
// (e.g. "RICE 25KG", 1 sack) is consumed to produce one or more TARGET items
// (e.g. "RICE 1KG", 25 pcs). Keeping outlet stock accurate after the physical
// product changes identity is the whole point: without this, the source never
// decreases and the targets go negative (or don't exist) when sold.
//
// Mechanics (one Mongo transaction):
//   - Deduct `sourceQty` from the source item. Like sales, this does NOT block
//     on insufficient stock (a POS shouldn't freeze at the counter); the
//     shortfall is recorded and returned as a warning, and stockQty may go
//     negative to reflect reality.
//   - Add each target's qty to its outlet-inventory row, creating the row if it
//     doesn't exist yet.
//   - Carry cost: the source's total cost (buyingPrice * sourceQty) is spread
//     across the produced target units so outlet stock value and profit/COGS
//     stay correct across the conversion.
//   - Write one REPACK_OUT (source) + one REPACK_IN per target, all sharing a
//     referenceType "REPACK" + referenceId so the conversion is auditable.

import { NextRequest, NextResponse } from "next/server";
import { allocateCompanyOutputs, weightedCompanyCost } from "@/lib/company-cost";
import { validIngredientQuantity } from "@/lib/business-flow";
import mongoose, { Types, isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { startOfDayManila, addDays } from "@/lib/date-utils";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import { packingSnapshot, toBaseUnitCost } from "@/lib/inventory-units";

export const dynamic = "force-dynamic";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type TargetInput = {
  // Either reference an existing outlet-inventory row...
  inventoryId?: string;
  // ...or describe a new/derived product to create the row on the fly.
  productSource?: "BODEGA" | "GROCERY";
  productId?: string;
  productName?: string;
  categoryName?: string;
  unitLabel?: string;
  packSize?: number;
  sellingPrice?: number;
  // Optional explicit unit cost for this target. Without it the source's total
  // cost is spread evenly per produced unit — wrong when targets differ in
  // size (a 5KG bag is not worth the same as a 1KG bag). Pass buyingPrice to
  // cost unequal targets correctly.
  buyingPrice?: number;
  qty?: number;
};

type SourceInput = {
  inventoryId?: string;
  qty?: number;
};

function inventoryPacking(item: any) {
  const packSize = Math.max(0, Math.trunc(Number(item.packSize || 0)));
  const baseUnit =
    item.productSource === "GROCERY"
      ? "QTY"
      : String(item.unitLabel || "").toUpperCase() === "HEAD"
        ? "HEAD"
        : "PCS";
  return packingSnapshot({
    unit: packSize > 0 ? "PACK" : baseUnit,
    baseUnit,
    multiplier: packSize || 1,
  });
}

const VALID_UNITS = ["PCS", "PACK", "QTY", "KG", "BAG"] as const;
function normalizeUnit(value: unknown): (typeof VALID_UNITS)[number] {
  const u = String(value || "").toUpperCase();
  return (VALID_UNITS as readonly string[]).includes(u)
    ? (u as (typeof VALID_UNITS)[number])
    : "QTY";
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

export async function GET(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, [
    "outlet-repack.manage",
    "outlet-inventory.view",
    "outlet-inventory.manage",
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

  // Today's repack ledger rows for this outlet (both sides of each conversion).
  // startOfDayManila gives the true Manila midnight regardless of the server's
  // timezone — rebuilding from calendar parts with `new Date(y, m, d)` would be
  // off by 8 hours on a UTC server.
  const dayStart = startOfDayManila();
  const dayEnd = addDays(dayStart, 1);

  const rows = await OutletStockTransactionModel.find({
    outletId: user.outlet.id,
    type: { $in: ["REPACK_OUT", "REPACK_IN"] },
    transactionDate: { $gte: dayStart, $lt: dayEnd },
  })
    .sort({ transactionDate: -1, _id: -1 })
    .limit(limit * 4) // a single repack writes several rows; over-fetch then group
    .lean();

  // Group both sides by the shared referenceId so the app can show one card per
  // conversion: the consumed source and the produced targets.
  const byRef = new Map<
    string,
    {
      referenceId: string;
      transactionDate?: string;
      source: { productName: string; quantity: number } | null;
      sources: { productName: string; quantity: number }[];
      targets: { productName: string; quantity: number }[];
    }
  >();

  for (const r of rows as any[]) {
    const ref = String(r.referenceId || r._id);
    if (!byRef.has(ref)) {
      byRef.set(ref, {
        referenceId: ref,
        transactionDate: r.transactionDate
          ? new Date(r.transactionDate).toISOString()
          : undefined,
        source: null,
        sources: [],
        targets: [],
      });
    }
    const entry = byRef.get(ref)!;
    const cell = { productName: r.productName || "", quantity: Number(r.quantity || 0) };
    if (r.type === "REPACK_OUT") {
      entry.sources.push(cell);
      entry.source ??= cell;
    }
    else entry.targets.push(cell);
  }

  const data = Array.from(byRef.values()).slice(0, limit);

  return NextResponse.json({ success: true, outlet: user.outlet, data });
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, "outlet-repack.manage");
  if (response) return response;

  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  await dbConnect();

  let body: {
    sourceInventoryId?: string;
    sourceQty?: number;
    sources?: SourceInput[];
    targets?: TargetInput[];
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
  const sources: SourceInput[] = Array.isArray(body?.sources)
    ? body.sources
    : [{ inventoryId: body?.sourceInventoryId, qty: body?.sourceQty }];
  const targets = Array.isArray(body?.targets) ? body.targets : [];
  const idempotencyKey = String(body?.idempotencyKey || "").trim();
  const remarks = String(body?.remarks || "").trim().toUpperCase();

  if (sources.length === 0 || sources.length > 50) {
    return NextResponse.json(
      { success: false, message: "Add between 1 and 50 ingredients." },
      { status: 400 }
    );
  }
  for (const source of sources) {
    const id = String(source?.inventoryId || "").trim();
    const qty = Number(source?.qty || 0);
    if (!isValidObjectId(id) || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { success: false, message: "Each ingredient needs a product and a positive quantity." },
        { status: 400 }
      );
    }
  }
  if (targets.length === 0) {
    return NextResponse.json(
      { success: false, message: "Add at least one product to repack into." },
      { status: 400 }
    );
  }
  if (targets.length > 50) {
    return NextResponse.json(
      { success: false, message: "Too many target products in one repack (maximum 50)." },
      { status: 400 }
    );
  }

  // Idempotency: a retried request (dropped response) must not convert twice.
  // Pre-check by the indexed first-class field; the partial unique index on
  // {outletId, idempotencyKey} is the real guard — a concurrent retry that
  // slips past this check hits E11000 inside the transaction and rolls back.
  if (idempotencyKey) {
    const existing = await findExistingRepack(outletId, idempotencyKey);
    if (existing) return existing;
  }

  const mongoSession = await mongoose.startSession();

  try {
    let result: any = null;

    await mongoSession.withTransaction(async () => {
      const warnings: string[] = [];
      const referenceId = new Types.ObjectId();
      const now = new Date();

      // 1) Consume every ingredient and combine their historical inventory
      // cost. Stock quantities are base units, while buyingPrice for a pack
      // product is a pack price, so convert it to cost per PCS first.
      const consumed: {
        inv: any;
        qty: number;
        before: number;
        after: number;
        unitCost: number;
      }[] = [];
      let totalSourceCost = 0;
      for (const input of sources) {
        const inventoryId = String(input.inventoryId || "");
        const qty = Number(input.qty || 0);
        const inv = await OutletInventoryModel.findOne({
          _id: inventoryId,
          outletId,
          isActive: true,
        }).session(mongoSession);
        if (!inv) throw new ApiError(404, "An ingredient is not stocked at this outlet.");
        if (!validIngredientQuantity(qty, inv.unitLabel)) throw new ApiError(400, "Pieces and heads must be whole; measured ingredients must have a positive quantity.");

        const before = Number(inv.stockQty || 0);
        const after = before - qty;
        if (after < 0) {
          warnings.push(`${inv.productName}: used ${qty} but only ${before} in stock (now ${after}).`);
        }
        const unitCost = toBaseUnitCost(inv.buyingPrice, inventoryPacking(inv));
        totalSourceCost += unitCost * qty;
        inv.stockQty = after;
        inv.updatedBy = new Types.ObjectId(user.id);
        await inv.save({ session: mongoSession });
        consumed.push({ inv, qty, before, after, unitCost });
      }

      // Validate targets + compute total produced units for cost spreading.
      const prepared: {
        inv: any;
        qty: number;
        productName: string;
        // Explicit unit cost from the client (0 = spread the source cost).
        unitCostOverride: number;
      }[] = [];
      let totalTargetUnits = 0;

      for (const t of targets) {
        const qty = Number(t?.qty || 0);
        if (!Number.isSafeInteger(qty) || qty < 1) {
          throw new ApiError(400, "Each target quantity must be a whole number of at least 1.");
        }

        let inv: any = null;

        if (t.inventoryId && isValidObjectId(String(t.inventoryId))) {
          inv = await OutletInventoryModel.findOne({
            _id: String(t.inventoryId),
            outletId,
            isActive: true,
          }).session(mongoSession);
          if (!inv) {
            throw new ApiError(404, "A target product was not found at this outlet.");
          }
        } else {
          // Create / reuse a derived product row for this outlet.
          const productSource = t.productSource === "GROCERY" ? "GROCERY" : "BODEGA";
          const productId =
            t.productId && isValidObjectId(String(t.productId))
              ? new Types.ObjectId(String(t.productId))
              : new Types.ObjectId(); // derived product with no main-system id
          const productName = String(t.productName || "").trim().toUpperCase();
          if (!productName) {
            throw new ApiError(400, "Each new target product needs a name.");
          }

          inv = await OutletInventoryModel.findOne({
            outletId,
            productSource,
            productId,
            isActive: true,
          }).session(mongoSession);

          if (!inv) {
            const [created] = await (OutletInventoryModel as any).create(
              [
                {
                  outletId,
                  productSource,
                  originType: "OUTLET_PRODUCTION",
                  productId,
                  productName,
                  categoryName: String(t.categoryName || consumed[0]?.inv.categoryName || "")
                    .trim()
                    .toUpperCase(),
                  stockQty: 0,
                  unitLabel: normalizeUnit(t.unitLabel),
                  packSize: Math.max(0, Math.trunc(Number(t.packSize || 0))),
                  lowStockAlert: 0,
                  buyingPrice: 0, // set below from spread cost
                  sellingPrice: Math.max(0, Number(t.sellingPrice || 0)),
                  isActive: true,
                  createdBy: new Types.ObjectId(user.id),
                },
              ],
              { session: mongoSession }
            );
            inv = created;
          }
        }

        // Any repack target is manufactured by this outlet, even when an
        // existing target inventory row is reused.
        inv.originType = "OUTLET_PRODUCTION";

        totalTargetUnits += qty;
        prepared.push({
          inv,
          qty,
          productName: inv.productName,
          unitCostOverride: Math.max(0, Number(t.buyingPrice || 0)),
        });
      }

      // Cost per produced unit (spread the source's total cost evenly). This
      // flat spread is only right when all targets are the same size; unequal
      // targets should pass an explicit buyingPrice override per target.
      const unitCost =
        totalTargetUnits > 0 ? totalSourceCost / totalTargetUnits : 0;
      const companyOutputCosts = allocateCompanyOutputs(
        consumed.map(source => ({ quantity: source.qty, companyUnitCost: source.inv.companyUnitCost })),
        prepared.map(target => ({ quantity: target.qty, weightPerUnit: target.unitCostOverride > 0 ? target.unitCostOverride : unitCost }))
      );

      const ledger: any[] = [];

      // 2) Ingredient side: one REPACK_OUT row per ingredient.
      //    be negative) so newStock - previousStock always equals quantity.
      //    The idempotencyKey lives on this row only — one per repack — and the
      //    partial unique index makes a concurrent duplicate abort here.
      consumed.forEach((p, index) => ledger.push({
        outletId,
        outletInventoryId: p.inv._id,
        productSource: p.inv.productSource,
        productId: p.inv.productId,
        productName: p.inv.productName,
        transactionDate: now,
        type: "REPACK_OUT",
        quantity: p.qty,
        unitCost: p.unitCost,
        entryUnit: inventoryPacking(p.inv).baseUnit,
        entryQty: p.qty,
        multiplier: 1,
        baseUnit: inventoryPacking(p.inv).baseUnit,
        previousStock: p.before,
        newStock: p.after,
        referenceType: "REPACK",
        referenceId,
        sourceChannel: "FLUTTER",
        idempotencyKey: index === 0 ? idempotencyKey || undefined : undefined,
        remarks: remarks
          ? `PRODUCTION INGREDIENT - ${remarks}`
          : "PRODUCTION INGREDIENT",
        createdBy: user.id,
      }));

      // 3) Target side: add stock + one REPACK_IN row each.
      for (const p of prepared) {
        const before = Number(p.inv.stockQty || 0);
        const after = before + p.qty;
        p.inv.companyUnitCost = weightedCompanyCost(before, p.inv.companyUnitCost, p.qty,
          companyOutputCosts[prepared.indexOf(p)]);

        p.inv.stockQty = after;

        // Weighted-average the unit cost with any existing stock instead of
        // overwriting it — overwriting would silently re-value stock already
        // on hand AND retroactively rewrite COGS for past sales, because the
        // profit reports price historical ledger rows at CURRENT buyingPrice.
        const incomingUnitCost =
          p.unitCostOverride > 0 ? p.unitCostOverride : unitCost;
        const existingUnits = Math.max(before, 0);
        const existingUnitCost = toBaseUnitCost(
          p.inv.buyingPrice,
          inventoryPacking(p.inv)
        );
        const newUnitCost =
          existingUnits > 0 && existingUnitCost > 0
            ? (existingUnits * existingUnitCost + p.qty * incomingUnitCost) /
              (existingUnits + p.qty)
            : incomingUnitCost;
        const targetPacking = inventoryPacking(p.inv);
        const storedCost = targetPacking.unit === "PACK"
          ? newUnitCost * targetPacking.multiplier
          : newUnitCost;
        p.inv.buyingPrice = Math.round(storedCost * 100) / 100;
        p.inv.updatedBy = new Types.ObjectId(user.id);
        await p.inv.save({ session: mongoSession });

        ledger.push({
          outletId,
          outletInventoryId: p.inv._id,
          productSource: p.inv.productSource,
          productId: p.inv.productId,
          productName: p.inv.productName,
          transactionDate: now,
          type: "REPACK_IN",
          quantity: p.qty,
          unitCost: incomingUnitCost,
          entryUnit: targetPacking.baseUnit,
          entryQty: p.qty,
          multiplier: 1,
          baseUnit: targetPacking.baseUnit,
          previousStock: before,
          newStock: after,
          referenceType: "REPACK",
          referenceId,
          sourceChannel: "FLUTTER",
          remarks: `PRODUCED FROM ${consumed.map((s) => s.inv.productName).join(", ")}${remarks ? ` - ${remarks}` : ""}`,
          createdBy: user.id,
        });
      }

      await (OutletStockTransactionModel as any).insertMany(ledger, {
        session: mongoSession,
      });

      result = {
        referenceId: referenceId.toString(),
        source: consumed.length ? {
          inventoryId: consumed[0].inv._id.toString(),
          productName: consumed[0].inv.productName,
          quantity: consumed[0].qty,
          newStock: consumed[0].after,
        } : null,
        sources: consumed.map((p) => ({
          inventoryId: p.inv._id.toString(),
          productName: p.inv.productName,
          quantity: p.qty,
          newStock: p.after,
          unitCost: p.unitCost,
        })),
        targets: prepared.map((p) => ({
          inventoryId: p.inv._id.toString(),
          productName: p.productName,
          quantity: p.qty,
          newStock: Number(p.inv.stockQty || 0),
          buyingPrice: Number(p.inv.buyingPrice || 0),
        })),
        warnings,
      };
    });

    return NextResponse.json({
      success: true,
      message: "Repack recorded.",
      repack: result,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    // A concurrent request with the same key won the unique-index race (this
    // transaction rolled back). Return the winning repack, not an error.
    if (isIdempotencyDuplicate(error) && idempotencyKey) {
      const existing = await findExistingRepack(outletId, idempotencyKey);
      if (existing) return existing;
    }
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Unable to record the repack." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}

/**
 * Duplicate response for an already-recorded repack (indexed field lookup),
 * or null when no prior repack carries this key.
 */
async function findExistingRepack(outletId: string, idempotencyKey: string) {
  const existing = await OutletStockTransactionModel.findOne({
    outletId,
    idempotencyKey,
  })
    .select("referenceId")
    .lean<{ referenceId?: { toString: () => string } }>();

  if (!existing) return null;

  return NextResponse.json({
    success: true,
    message: "Repack already recorded.",
    duplicate: true,
    referenceId: existing.referenceId?.toString(),
  });
}
