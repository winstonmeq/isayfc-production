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
import { manilaDateString } from "@/lib/date-utils";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";
import CustomerModel from "@/models/Customer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("reports.sales");
  if (response) return response;

  await dbConnect();
  void CustomerModel; // register for populate

  const { searchParams } = new URL(req.url);
  const { start, end } = parseReportRange(searchParams);
  const sourceParam = String(searchParams.get("source") || "").toUpperCase();
  const source =
    sourceParam === "CHICKEN" || sourceParam === "BODEGA" ? sourceParam : null;

  const saleFilter: Record<string, unknown> = {
    isVoided: false,
    saleDate: { $gte: start, $lt: end },
  };
  if (source) saleFilter.source = source;

  const sales = await SaleModel.find(saleFilter)
    .populate("customerId", "name")
    .select(
      "receiptNumber saleDate source totalQty totalAmount paidAmount balance status customerId channel paymentMethod"
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
        paymentMethod?: string;
        customerId?: { name?: string } | null;
      }>
    >();

  // --- Register rows + daily subtotals ---
  type RegisterRow = {
    id: string;
    receiptNumber: string;
    saleDate: string;
    day: string;
    source: string;
    customerName: string;
    qty: number;
    totalAmount: number;
    paidAmount: number;
    balance: number;
    status: string;
  };

  const rows: RegisterRow[] = sales.map((s) => {
    const date = s.saleDate ? new Date(s.saleDate) : null;
    return {
      id: s._id.toString(),
      receiptNumber: String(s.receiptNumber || ""),
      saleDate: date ? date.toISOString() : "",
      day: date ? manilaDateString(date) : "",
      source: String(s.source || ""),
      customerName: s.customerId?.name || "Walk-in",
      qty: Number(s.totalQty || 0),
      totalAmount: roundMoney(Number(s.totalAmount || 0)),
      paidAmount: roundMoney(Number(s.paidAmount || 0)),
      balance: roundMoney(Number(s.balance || 0)),
      status: String(s.status || ""),
    };
  });

  const dailyMap = new Map<
    string,
    { day: string; count: number; qty: number; total: number; paid: number; balance: number }
  >();
  for (const r of rows) {
    const cur =
      dailyMap.get(r.day) ||
      { day: r.day, count: 0, qty: 0, total: 0, paid: 0, balance: 0 };
    cur.count += 1;
    cur.qty += r.qty;
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
      acc.total = roundMoney(acc.total + r.totalAmount);
      acc.paid = roundMoney(acc.paid + r.paidAmount);
      acc.balance = roundMoney(acc.balance + r.balance);
      return acc;
    },
    { count: 0, qty: 0, total: 0, paid: 0, balance: 0 }
  );

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
  const saleIds = sales.map((s) => s._id);
  type LineAgg = { _id: string; qty?: number; total?: number; count?: number };

  const [byProduct, byCategory] =
    saleIds.length === 0
      ? [[] as LineAgg[], [] as LineAgg[]]
      : await Promise.all([
          SaleLineModel.aggregate<LineAgg>([
            { $match: { saleId: { $in: saleIds } } },
            {
              $group: {
                _id: "$productName",
                qty: { $sum: "$qty" },
                total: { $sum: "$lineTotal" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
            { $limit: 200 },
          ]),
          SaleLineModel.aggregate<LineAgg>([
            { $match: { saleId: { $in: saleIds } } },
            {
              $group: {
                _id: "$categoryName",
                qty: { $sum: "$qty" },
                total: { $sum: "$lineTotal" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ]),
        ]);

  const mapAgg = (arr: LineAgg[]) =>
    arr.map((a) => ({
      name: String(a._id || "—"),
      qty: Number(a.qty || 0),
      total: roundMoney(Number(a.total || 0)),
      count: Number(a.count || 0),
    }));

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
  });
}
