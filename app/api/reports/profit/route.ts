import { internalOutletMatchClauses } from "@/lib/internal-outlet";
// Main-company income statement: gross sales less sales discounts = net sales.
// Gross profit = net sales less COGS; net profit also deducts operating expenses.
// Product cost snapshots are used where available, with legacy cost fallbacks.
// Outlet POS activity is reported separately.

import { NextRequest, NextResponse } from "next/server";
import { recognizedSaleRange } from "@/lib/business-flow";
import { Types } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { parseReportRange, roundMoney } from "@/lib/report-utils";
import { manilaDateString } from "@/lib/date-utils";
import { getExpenseTypeNames } from "@/lib/expense-types";
import { salesReportAmounts } from "@/lib/sales-report-amounts";
import { outletSaleMatchClauses } from "@/lib/sale-origin";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";
import ProductModel from "@/models/Product";
import BodegaProductModel from "@/models/BodegaProduct";
import ExpenseModel from "@/models/Expense";
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
  //    are identified by their first-class OUTLET source. Channel and the
  //    MOB- receipt prefix remain as compatibility fallbacks for legacy rows.
  //    their lines are menu items with NO productId/bodegaProductId, so they
  //    cannot be costed from the product maps below — their real COGS lives in
  //    the outlet stock ledger (component deductions) and is added separately.
  const sales = await SaleModel.find({
    isVoided: false,
    fulfillmentStatus: { $ne: "PENDING" },
    $expr: recognizedSaleRange(start, end),
    $nor: [...outletSaleMatchClauses(), ...internalOutletMatchClauses()],
  })
    .select("_id source channel receiptNumber")
    .lean<
      Array<{
        _id: Types.ObjectId;
        source?: string;
        channel?: string;
        receiptNumber?: string;
      }>
    >();

  const saleIds = sales.map((s) => s._id);
  type Line = {
    source?: string;
    productId?: { toString: () => string } | null;
    bodegaProductId?: { toString: () => string } | null;
    qty?: number;
    stockPcsOut?: number;
    baseQty?: number;
    lineTotal?: number;
    grossLineTotal?: number;
    discountAmount?: number;
    unitCost?: number;
  };

  const lines: Line[] =
    saleIds.length === 0
      ? []
      : await SaleLineModel.find({ saleId: { $in: saleIds } })
          .select(
            "source productId bodegaProductId qty stockPcsOut baseQty lineTotal grossLineTotal discountAmount unitCost"
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
    CHICKEN: { revenue: 0, grossSales: 0, discounts: 0, cogs: 0 },
    BODEGA: { revenue: 0, grossSales: 0, discounts: 0, cogs: 0 },
  };

  for (const l of lines) {
    const isChicken = l.source === "CHICKEN" || !!l.bodegaProductId;
    const bucket = isChicken ? bySource.CHICKEN : bySource.BODEGA;
    const amounts = salesReportAmounts(l);
    const revenue = amounts.netSales;
    bucket.grossSales = roundMoney(bucket.grossSales + amounts.grossSales);
    bucket.discounts = roundMoney(bucket.discounts + amounts.discounts);
    // Cost = pieces sold × unit cost. stockPcsOut is the true base-unit qty
    // (packs already expanded); fall back to qty.
    const pcs = Number(l.baseQty ?? l.stockPcsOut ?? l.qty ?? 0);
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
  const revenue = roundMoney(
    bySource.CHICKEN.revenue + bySource.BODEGA.revenue
  );
  const cogs = roundMoney(
    bySource.CHICKEN.cogs + bySource.BODEGA.cogs
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
        $nor: [
          { expenseCategory: "OUTLET" },
          { outletId: { $exists: true, $ne: null } },
          { remarks: { $regex: "MOBILE EXPENSE OUTLET:", $options: "i" } },
        ],
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

  const expenseNames = await getExpenseTypeNames();
  const expenses = expenseAgg.map((e) => ({
    type: String(e._id || "OTHERS"),
    name: expenseNames.get(String(e._id || "OTHERS")) || String(e._id || "OTHERS").replaceAll("_", " "),
    total: roundMoney(Number(e.total || 0)),
    count: Number(e.count || 0),
  }));
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
      grossSales: roundMoney(bySource.CHICKEN.grossSales + bySource.BODEGA.grossSales),
      grossChicken: bySource.CHICKEN.grossSales,
      grossGrocery: bySource.BODEGA.grossSales,
      discounts: roundMoney(bySource.CHICKEN.discounts + bySource.BODEGA.discounts),
      chickenDiscounts: bySource.CHICKEN.discounts,
      groceryDiscounts: bySource.BODEGA.discounts,
    },
    cogs: {
      total: cogs,
      chicken: roundMoney(bySource.CHICKEN.cogs),
      grocery: roundMoney(bySource.BODEGA.cogs),
    },
    grossProfit,
    grossMarginPct,
    expenses,
    expenseTotal,
    netProfit,
    netMarginPct,
  });
}
