// app/api/reports/profit/route.ts
//
// Consolidated Profit Report — a standard income statement (P&L) for the
// period:
//
//   Revenue (Chicken + Grocery)
//   − Cost of Goods Sold (cost behind those sales, by source)
//   = Gross Profit
//   − Operating Expenses (by type)
//   = Net Profit
//
// Revenue/COGS come from sale lines: each line's lineTotal is revenue, and its
// quantity × the product's buyingPrice is the cost. Chicken lines reference a
// BodegaProduct; grocery lines reference a Product.
//
// COGS uses each product's CURRENT buyingPrice (the system keeps no per-line
// cost snapshot), so historical cost reflects today's cost if prices changed.

import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { parseReportRange, roundMoney } from "@/lib/report-utils";
import { manilaDateString } from "@/lib/date-utils";
import { cogsByOutlet } from "@/lib/outlet-profit";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";
import ProductModel from "@/models/Product";
import BodegaProductModel from "@/models/BodegaProduct";
import ExpenseModel from "@/models/Expense";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import StandardPackingModel from "@/models/StandardPacking";
import {
  packingSnapshot,
  toBaseUnitCost,
} from "@/lib/inventory-units";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("reports.profit");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { start, end } = parseReportRange(searchParams);

  // 1) Non-voided sales in the period -> their line items. Mobile POS sales
  //    are identified by channel (or the MOB- receipt prefix on legacy rows):
  //    their lines are menu items with NO productId/bodegaProductId, so they
  //    cannot be costed from the product maps below — their real COGS lives in
  //    the outlet stock ledger (component deductions) and is added separately.
  const sales = await SaleModel.find({
    isVoided: false,
    saleDate: { $gte: start, $lt: end },
  })
    .select("_id channel receiptNumber")
    .lean<
      Array<{ _id: Types.ObjectId; channel?: string; receiptNumber?: string }>
    >();

  const saleIds = sales.map((s) => s._id);
  const mobileSaleIds = new Set(
    sales
      .filter(
        (s) =>
          s.channel === "MOBILE" ||
          String(s.receiptNumber || "").startsWith("MOB-")
      )
      .map((s) => s._id.toString())
  );

  type Line = {
    saleId?: { toString: () => string } | null;
    source?: string;
    productId?: { toString: () => string } | null;
    bodegaProductId?: { toString: () => string } | null;
    qty?: number;
    stockPcsOut?: number;
    lineTotal?: number;
    unitCost?: number;
  };

  const lines: Line[] =
    saleIds.length === 0
      ? []
      : await SaleLineModel.find({ saleId: { $in: saleIds } })
          .select(
            "saleId source productId bodegaProductId qty stockPcsOut lineTotal unitCost"
          )
          .lean<Line[]>();

  // 2) Look up cost (buyingPrice) for every referenced product.
  const productIds = new Set<string>();
  const bodegaIds = new Set<string>();
  for (const l of lines) {
    if (l.productId) productIds.add(l.productId.toString());
    if (l.bodegaProductId) bodegaIds.add(l.bodegaProductId.toString());
  }

  const [products, bodegaProducts, packingStandards] = await Promise.all([
    productIds.size
      ? ProductModel.find({ _id: { $in: [...productIds] } })
          .select("buyingPrice")
          .lean<Array<{ _id: { toString: () => string }; buyingPrice?: number }>>()
      : Promise.resolve([]),
    bodegaIds.size
      ? BodegaProductModel.find({ _id: { $in: [...bodegaIds] } })
          .select("buyingPrice")
          .lean<Array<{ _id: { toString: () => string }; buyingPrice?: number }>>()
      : Promise.resolve([]),
    bodegaIds.size
      ? StandardPackingModel.find({
          isActive: true,
          productId: { $in: [...bodegaIds] },
          standardPacking: { $gt: 0 },
        })
          .select("productId standardPacking")
          .sort({ updatedAt: -1, _id: -1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const productCost = new Map(
    products.map((p) => [p._id.toString(), Number(p.buyingPrice || 0)])
  );
  const packSizeByProduct = new Map<string, number>();
  for (const standard of packingStandards) {
    const id = standard.productId?.toString();
    if (id && !packSizeByProduct.has(id)) {
      packSizeByProduct.set(id, Number(standard.standardPacking || 0));
    }
  }
  const bodegaCost = new Map(
    bodegaProducts.map((p) => {
      const id = p._id.toString();
      const packSize = packSizeByProduct.get(id) || 0;
      const savedCost = Number(p.buyingPrice || 0);
      return [
        id,
        toBaseUnitCost(
          savedCost,
          packingSnapshot({
            unit: packSize > 0 ? "PACK" : "PCS",
            baseUnit: "PCS",
            multiplier: packSize,
          })
        ),
      ];
    })
  );

  // 3) Accumulate revenue + COGS, split by source. Mobile POS lines go to
  //    their own OUTLET bucket: they carry no product refs, so costing them
  //    from the product maps would book them at zero COGS (100% margin).
  const bySource = {
    CHICKEN: { revenue: 0, cogs: 0 },
    BODEGA: { revenue: 0, cogs: 0 },
    OUTLET: { revenue: 0, cogs: 0 },
  };

  for (const l of lines) {
    if (mobileSaleIds.has(l.saleId?.toString() || "")) {
      bySource.OUTLET.revenue = roundMoney(
        bySource.OUTLET.revenue + Number(l.lineTotal || 0)
      );
      continue; // COGS for mobile sales comes from the outlet ledger below
    }

    const isChicken = l.source === "CHICKEN" || !!l.bodegaProductId;
    const bucket = isChicken ? bySource.CHICKEN : bySource.BODEGA;
    const revenue = Number(l.lineTotal || 0);
    // Cost = pieces sold × unit cost. stockPcsOut is the true base-unit qty
    // (packs already expanded); fall back to qty.
    const pcs = Number(l.stockPcsOut || l.qty || 0);
    const unitCost =
      Number(l.unitCost || 0) ||
      (isChicken
        ? bodegaCost.get(l.bodegaProductId?.toString() || "") || 0
        : productCost.get(l.productId?.toString() || "") || 0);

    bucket.revenue = roundMoney(bucket.revenue + revenue);
    bucket.cogs = roundMoney(bucket.cogs + pcs * unitCost);
  }

  // Mobile POS COGS from the outlet stock ledger (SALE component deductions ×
  // outlet buyingPrice) — the same source outlet-summary uses, so the two
  // reports agree.
  const outletCogsMap = await cogsByOutlet(start, end);
  for (const value of outletCogsMap.values()) {
    bySource.OUTLET.cogs = roundMoney(bySource.OUTLET.cogs + value);
  }

  const revenue = roundMoney(
    bySource.CHICKEN.revenue + bySource.BODEGA.revenue + bySource.OUTLET.revenue
  );
  const cogs = roundMoney(
    bySource.CHICKEN.cogs + bySource.BODEGA.cogs + bySource.OUTLET.cogs
  );
  const grossProfit = roundMoney(revenue - cogs);

  // 4) Operating expenses in the period, grouped by type.
  const expenseAgg = await ExpenseModel.aggregate<{
    _id: string;
    total?: number;
    count?: number;
  }>([
    {
      $match: {
        isActive: true,
        expenseDate: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: "$type",
        total: { $sum: { $ifNull: ["$amount", 0] } },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);

  const expenses = expenseAgg.map((e) => ({
    type: String(e._id || "OTHERS"),
    total: roundMoney(Number(e.total || 0)),
    count: Number(e.count || 0),
  }));
  const deductionLossRows = await OutletStockTransactionModel.aggregate<{
    total?: number;
    count?: number;
  }>([
    {
      $match: {
        type: "STOCK_OUT",
        referenceType: "MANUAL_DEDUCTION",
        transactionDate: { $gte: start, $lt: end },
      },
    },
    {
      $lookup: {
        from: "outletinventories",
        localField: "outletInventoryId",
        foreignField: "_id",
        as: "inventory",
      },
    },
    {
      $project: {
        loss: {
          $multiply: [
            "$quantity",
            {
              $cond: [
                { $gt: [{ $ifNull: ["$unitCost", 0] }, 0] },
                "$unitCost",
                {
                  $ifNull: [
                    { $arrayElemAt: ["$inventory.buyingPrice", 0] },
                    0,
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$loss" },
        count: { $sum: 1 },
      },
    },
  ]);
  const deductionLoss = roundMoney(Number(deductionLossRows[0]?.total || 0));
  if (deductionLoss > 0) {
    expenses.push({
      type: "INVENTORY_DEDUCTION_LOSS",
      total: deductionLoss,
      count: Number(deductionLossRows[0]?.count || 0),
    });
  }
  const expenseTotal = roundMoney(
    expenses.reduce((s, e) => s + e.total, 0)
  );

  const netProfit = roundMoney(grossProfit - expenseTotal);
  const grossMarginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0;
  const netMarginPct = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;

  return NextResponse.json({
    success: true,
    range: { start: start.toISOString(), end: end.toISOString() },
    generatedAt: manilaDateString(),
    revenue: {
      total: revenue,
      chicken: roundMoney(bySource.CHICKEN.revenue),
      grocery: roundMoney(bySource.BODEGA.revenue),
      outlet: roundMoney(bySource.OUTLET.revenue),
    },
    cogs: {
      total: cogs,
      chicken: roundMoney(bySource.CHICKEN.cogs),
      grocery: roundMoney(bySource.BODEGA.cogs),
      outlet: roundMoney(bySource.OUTLET.cogs),
    },
    grossProfit,
    grossMarginPct,
    expenses,
    expenseTotal,
    netProfit,
    netMarginPct,
  });
}
