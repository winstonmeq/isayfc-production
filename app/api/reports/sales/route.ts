// app/api/reports/sales/route.ts
//
// Standard Sales Report: a sales register (one row per sale, dated, with daily
// subtotals and a grand total), a cash-vs-credit split, and summaries grouped
// by product and by category. Reads the shared report date range.
//
// "Net" here equals gross — the system records no per-sale discount, so we do
// not show a discount column that would always be zero.

import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { parseReportRange, roundMoney } from "@/lib/report-utils";
import { addDays, manilaDateString } from "@/lib/date-utils";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";
import CustomerModel from "@/models/Customer";
import OutletModel from "@/models/Outlet";
import { getSaleOrigin, getSaleSourceLabel } from "@/lib/sale-origin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("reports.sales");
  if (response) return response;

  await dbConnect();
  void CustomerModel; // register for populate
  void OutletModel; // register for populate

  const { searchParams } = new URL(req.url);
  const { start, end } = parseReportRange(searchParams);
  const sourceParam = String(searchParams.get("source") || "").toUpperCase();
  const source =
    sourceParam === "CHICKEN" ||
    sourceParam === "BODEGA" ||
    sourceParam === "OUTLET"
      ? sourceParam
      : null;

  const saleFilter: Record<string, unknown> = {
    isVoided: false,
    saleDate: { $gte: start, $lt: end },
  };
  if (source === "OUTLET") {
    saleFilter.$or = [
      { channel: "MOBILE" },
      { receiptNumber: { $regex: "^MOB-" } },
    ];
  } else if (source === "BODEGA" || source === "CHICKEN") {
    // A mixed receipt belongs in both product-type reports. The line-level
    // filtering below limits its quantities and peso values to the selected
    // product type.
    saleFilter.source = { $in: [source, "MIXED"] };
    saleFilter.$nor = [
      { channel: "MOBILE" },
      { receiptNumber: { $regex: "^MOB-" } },
    ];
  }

  const sales = await SaleModel.find(saleFilter)
    .populate("customerId", "name")
    .populate("outletId", "name code")
    .select(
      "receiptNumber saleDate source totalQty totalAmount paidAmount balance status customerId outletId channel paymentMethod"
    )
    .sort({ saleDate: 1, createdAt: 1 })
    .lean<
      Array<{
        _id: { toString: () => string };
        receiptNumber?: string;
        saleDate?: Date;
        source?: string;
        totalQty?: number;
        totalAmount?: number;
        paidAmount?: number;
        balance?: number;
        status?: string;
        channel?: string;
        outletId?: { name?: string; code?: string } | null;
        paymentMethod?: string;
        customerId?: { name?: string } | null;
      }>
    >();

  const saleIds = sales.map((s) => s._id);
  const registerLines =
    saleIds.length === 0
      ? []
      : await SaleLineModel.find({
          saleId: { $in: saleIds.map((id) => id.toString()) },
          ...(source === "CHICKEN" || source === "BODEGA"
            ? { source }
            : {}),
        })
          .select("saleId source qty stockUnit stockPcsOut baseQty lineTotal")
          .lean<
            Array<{
              saleId: { toString: () => string };
              source?: string;
              qty?: number;
              stockUnit?: string;
              stockPcsOut?: number;
              baseQty?: number;
              lineTotal?: number;
            }>
          >();
  type SoldBreakdown = {
    source: "CHICKEN" | "GROCERY" | "OUTLET";
    packs: number;
    pcsOut: number;
    quantity: number;
    totalAmount: number;
  };
  const saleById = new Map(sales.map((sale) => [sale._id.toString(), sale]));
  const quantityBySale = new Map<string, Map<string, SoldBreakdown>>();
  for (const line of registerLines) {
    const saleId = line.saleId.toString();
    const sale = saleById.get(saleId);
    const origin = sale ? getSaleOrigin(sale) : "GROCERY";
    const displaySource: SoldBreakdown["source"] =
      origin === "OUTLET"
        ? "OUTLET"
        : line.source === "CHICKEN"
          ? "CHICKEN"
          : "GROCERY";
    const saleBreakdown = quantityBySale.get(saleId) || new Map();
    const current = saleBreakdown.get(displaySource) || {
      source: displaySource,
      packs: 0,
      pcsOut: 0,
      quantity: 0,
      totalAmount: 0,
    };
    if (line.source === "CHICKEN" || line.stockUnit === "PACK") {
      current.packs += Number(line.qty || 0);
      current.pcsOut += Number(line.baseQty ?? line.stockPcsOut ?? 0);
    } else {
      current.quantity += Number(line.qty || 0);
    }
    current.totalAmount = roundMoney(
      current.totalAmount + Number(line.lineTotal || 0)
    );
    saleBreakdown.set(displaySource, current);
    quantityBySale.set(saleId, saleBreakdown);
  }
  const formatSoldQuantity = (value: {
    packs: number;
    pcsOut: number;
    quantity: number;
  }) => {
    const parts: string[] = [];
    if (value.packs > 0) {
      parts.push(
        `${value.packs.toLocaleString()} packs (${value.pcsOut.toLocaleString()} pcs out)`
      );
    }
    if (value.quantity > 0) parts.push(`${value.quantity.toLocaleString()} qty`);
    return parts.join(" + ") || "0";
  };

  // --- Register rows + daily subtotals ---
  type RegisterRow = {
    id: string;
    saleId: string;
    receiptNumber: string;
    saleDate: string;
    day: string;
    source: string;
    customerName: string;
    qty: number;
    packs: number;
    pcsOut: number;
    quantity: number;
    qtyDisplay: string;
    totalAmount: number;
    paidAmount: number;
    balance: number;
    status: string;
  };

  const rows: RegisterRow[] = sales.flatMap((s) => {
    const date = s.saleDate ? new Date(s.saleDate) : null;
    const saleId = s._id.toString();
    const origin = getSaleOrigin(s);
    const saleTotal = roundMoney(Number(s.totalAmount || 0));
    const breakdown = quantityBySale.get(saleId);
    const parts = breakdown
      ? [...breakdown.values()]
      : [
          {
            source:
              origin === "OUTLET"
                ? ("OUTLET" as const)
                : origin === "CHICKEN"
                  ? ("CHICKEN" as const)
                  : ("GROCERY" as const),
            packs: 0,
            pcsOut: 0,
            quantity: Number(s.totalQty || 0),
            totalAmount: saleTotal,
          },
        ];

    return parts.map((sold) => {
      const filteredTotal = roundMoney(sold.totalAmount);
      const allocationRatio = saleTotal > 0 ? filteredTotal / saleTotal : 0;
      const filteredPaid = roundMoney(
        Math.min(filteredTotal, Number(s.paidAmount || 0) * allocationRatio)
      );
      return {
        id: `${saleId}-${sold.source}`,
        saleId,
        receiptNumber: String(s.receiptNumber || ""),
        saleDate: date ? date.toISOString() : "",
        day: date ? manilaDateString(date) : "",
        customerName: s.customerId?.name || "Walk-in",
        qty: sold.packs + sold.quantity,
        ...sold,
        source:
          sold.source === "OUTLET" ? getSaleSourceLabel(s) : sold.source,
        qtyDisplay: formatSoldQuantity(sold),
        totalAmount: filteredTotal,
        paidAmount: filteredPaid,
        balance: roundMoney(Math.max(filteredTotal - filteredPaid, 0)),
        status: String(s.status || ""),
      };
    });
  });

  const dailyMap = new Map<
    string,
    {
      day: string;
      count: number;
      qty: number;
      packs: number;
      pcsOut: number;
      quantity: number;
      qtyDisplay: string;
      total: number;
      paid: number;
      balance: number;
    }
  >();
  for (const r of rows) {
    const cur =
      dailyMap.get(r.day) ||
      {
        day: r.day,
        count: 0,
        qty: 0,
        packs: 0,
        pcsOut: 0,
        quantity: 0,
        qtyDisplay: "0",
        total: 0,
        paid: 0,
        balance: 0,
      };
    cur.count = new Set(
      rows.filter((row) => row.day === r.day).map((row) => row.saleId)
    ).size;
    cur.qty += r.qty;
    cur.packs += r.packs;
    cur.pcsOut += r.pcsOut;
    cur.quantity += r.quantity;
    cur.qtyDisplay = formatSoldQuantity(cur);
    cur.total = roundMoney(cur.total + r.totalAmount);
    cur.paid = roundMoney(cur.paid + r.paidAmount);
    cur.balance = roundMoney(cur.balance + r.balance);
    dailyMap.set(r.day, cur);
  }
  const daily = [...dailyMap.values()].sort((a, b) => a.day.localeCompare(b.day));

  // --- Grand totals + cash/credit split ---
  const grand = rows.reduce(
    (acc, r) => {
      acc.count += 1;
      acc.qty += r.qty;
      acc.packs += r.packs;
      acc.pcsOut += r.pcsOut;
      acc.quantity += r.quantity;
      acc.qtyDisplay = formatSoldQuantity(acc);
      acc.total = roundMoney(acc.total + r.totalAmount);
      acc.paid = roundMoney(acc.paid + r.paidAmount);
      acc.balance = roundMoney(acc.balance + r.balance);
      return acc;
    },
    {
      count: 0,
      qty: 0,
      packs: 0,
      pcsOut: 0,
      quantity: 0,
      qtyDisplay: "0",
      total: 0,
      paid: 0,
      balance: 0,
    }
  );
  grand.count = new Set(rows.map((row) => row.saleId)).size;

  // Cash sales = fully paid (balance 0); credit = has an outstanding balance.
  const split = rows.reduce(
    (acc, r) => {
      if (r.balance > 0) {
        acc.creditCount += 1;
        acc.creditTotal = roundMoney(acc.creditTotal + r.totalAmount);
      } else {
        acc.cashCount += 1;
        acc.cashTotal = roundMoney(acc.cashTotal + r.totalAmount);
      }
      return acc;
    },
    { cashCount: 0, cashTotal: 0, creditCount: 0, creditTotal: 0 }
  );

  // --- Summaries by product and category (from sale lines) ---
  type LineAgg = {
    _id: { name?: string; unit?: string };
    qty?: number;
    total?: number;
    count?: number;
  };

  const selectedLineMatch = {
    saleId: { $in: saleIds },
    ...(source === "CHICKEN" || source === "BODEGA" ? { source } : {}),
  };

  const [byProduct, byCategory, chickenLines] =
    saleIds.length === 0
      ? [[] as LineAgg[], [] as LineAgg[], []]
      : await Promise.all([
          SaleLineModel.aggregate<LineAgg>([
            { $match: selectedLineMatch },
            {
              $group: {
                _id: { name: "$productName", unit: "$stockUnit" },
                qty: { $sum: "$qty" },
                total: { $sum: "$lineTotal" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
            { $limit: 200 },
          ]),
          SaleLineModel.aggregate<LineAgg>([
            { $match: selectedLineMatch },
            {
              $group: {
                _id: { name: "$categoryName", unit: "$stockUnit" },
                qty: { $sum: "$qty" },
                total: { $sum: "$lineTotal" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ]),
          SaleLineModel.find({
            saleId: { $in: saleIds.map((id) => id.toString()) },
            source: "CHICKEN",
          })
            .select("saleId productName lineTotal")
            .lean<
              Array<{
                saleId: { toString: () => string };
                productName?: string;
                lineTotal?: number;
              }>
            >(),
        ]);

  const mapAgg = (arr: LineAgg[]) =>
    arr.map((a) => ({
      name: String(a._id?.name || "—"),
      qty: Number(a.qty || 0),
      unit: a._id?.unit === "PACK" ? "packs" : "qty",
      total: roundMoney(Number(a.total || 0)),
      count: Number(a.count || 0),
    }));

  // Daily chicken-cut sales matrix. Product columns are dynamic so a newly
  // created cut automatically appears without a report code change.
  const saleDayById = new Map(rows.map((row) => [row.saleId, row.day]));
  const productSet = new Set<string>();
  const matrixValues = new Map<string, Map<string, number>>();

  for (const line of chickenLines) {
    const day = saleDayById.get(line.saleId.toString());
    const product = String(line.productName || "Unspecified").trim() || "Unspecified";
    if (!day) continue;

    productSet.add(product);
    const dayValues = matrixValues.get(day) || new Map<string, number>();
    dayValues.set(
      product,
      roundMoney((dayValues.get(product) || 0) + Number(line.lineTotal || 0))
    );
    matrixValues.set(day, dayValues);
  }

  const chickenCutProducts = [...productSet].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  const chickenCutTotals = Object.fromEntries(
    chickenCutProducts.map((product) => [
      product,
      roundMoney(
        [...matrixValues.values()].reduce(
          (sum, values) => sum + (values.get(product) || 0),
          0
        )
      ),
    ])
  );
  const chickenCutRows = [];
  for (let date = start; date < end; date = addDays(date, 1)) {
    const day = manilaDateString(date);
    const values = matrixValues.get(day);
    chickenCutRows.push({
      day,
      values: Object.fromEntries(
        chickenCutProducts.map((product) => [
          product,
          roundMoney(values?.get(product) || 0),
        ])
      ),
      total: roundMoney(
        chickenCutProducts.reduce(
          (sum, product) => sum + (values?.get(product) || 0),
          0
        )
      ),
    });
  }

  return NextResponse.json({
    success: true,
    range: { start: start.toISOString(), end: end.toISOString() },
    generatedAt: manilaDateString(),
    rows,
    daily,
    grand,
    split,
    byProduct: mapAgg(byProduct),
    byCategory: mapAgg(byCategory),
    chickenCuts: {
      products: chickenCutProducts,
      rows: chickenCutRows,
      totals: chickenCutTotals,
      grandTotal: roundMoney(
        Object.values(chickenCutTotals).reduce((sum, value) => sum + value, 0)
      ),
    },
  });
}
