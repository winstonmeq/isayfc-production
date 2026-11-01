// app/api/outlet-summary/route.ts
//
// Owner-facing per-outlet PROFIT: sales, cost of goods sold, gross profit,
// margin, expenses, and net profit for each outlet over a date range. Sales
// and expenses are matched to an outlet by the first-class `outletId` field
// (with a legacy "OUTLET:<id>" remarks fallback); COGS comes from the outlet
// stock ledger via lib/outlet-profit.

import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { cogsByOutlet, marginPct, parseRange } from "@/lib/outlet-profit";
import { outletSaleMatchClauses } from "@/lib/sale-origin";
import OutletModel from "@/models/Outlet";
import SaleModel from "@/models/Sale";
import ExpenseModel from "@/models/Expense";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("reports.outlet-comparison");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { start, end } = parseRange(searchParams);

  const outlets = await OutletModel.find({})
    .select("name code isActive status")
    .sort({ name: 1 })
    .lean<
      Array<{
        _id: { toString: () => string };
        name?: string;
        code?: string;
        isActive?: boolean;
      }>
    >();

  // Aggregate mobile sales by outlet within the date range. Current rows carry
  // a first-class `outletId`; rows written before that field existed only have
  // the "OUTLET:<id>" remarks tag, so we derive a string outlet id from either.
  const salesByOutlet = await SaleModel.aggregate<{
    _id: string | null;
    salesTotal?: number;
    salesCount?: number;
  }>([
    {
      $match: {
        saleDate: { $gte: start, $lt: end },
        isVoided: { $ne: true },
        $or: outletSaleMatchClauses(),
      },
    },
    {
      $project: {
        totalAmount: 1,
        outletId: {
          $cond: [
            { $ifNull: ["$outletId", false] },
            { $toString: "$outletId" },
            {
              $arrayElemAt: [
                {
                  $first: {
                    $map: {
                      input: {
                        $regexFindAll: {
                          input: { $ifNull: ["$remarks", ""] },
                          regex: "OUTLET:([a-f0-9]{24})",
                        },
                      },
                      as: "m",
                      in: "$$m.captures",
                    },
                  },
                },
                0,
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$outletId",
        salesTotal: { $sum: "$totalAmount" },
        salesCount: { $sum: 1 },
      },
    },
  ]);

  // Aggregate mobile expenses by outlet (first-class field, remarks fallback).
  const expensesByOutlet = await ExpenseModel.aggregate<{
    _id: string | null;
    expenseTotal?: number;
    expenseCount?: number;
  }>([
    {
      $match: {
        isActive: true,
        expenseDate: { $gte: start, $lt: end },
        $or: [
          { outletId: { $ne: null } },
          { remarks: { $regex: "MOBILE EXPENSE OUTLET:" } },
        ],
      },
    },
    {
      $project: {
        amount: 1,
        outletId: {
          $cond: [
            { $ifNull: ["$outletId", false] },
            { $toString: "$outletId" },
            {
              $arrayElemAt: [
                {
                  $first: {
                    $map: {
                      input: {
                        $regexFindAll: {
                          input: { $ifNull: ["$remarks", ""] },
                          regex: "OUTLET:([a-f0-9]{24})",
                        },
                      },
                      as: "m",
                      in: "$$m.captures",
                    },
                  },
                },
                0,
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$outletId",
        expenseTotal: { $sum: "$amount" },
        expenseCount: { $sum: 1 },
      },
    },
  ]);

  const salesMap = new Map<string, { salesTotal: number; salesCount: number }>();
  for (const s of salesByOutlet) {
    if (s._id) salesMap.set(String(s._id), {
      salesTotal: Number(s.salesTotal || 0),
      salesCount: Number(s.salesCount || 0),
    });
  }
  const expenseMap = new Map<string, { expenseTotal: number; expenseCount: number }>();
  for (const e of expensesByOutlet) {
    if (e._id) expenseMap.set(String(e._id), {
      expenseTotal: Number(e.expenseTotal || 0),
      expenseCount: Number(e.expenseCount || 0),
    });
  }

  // Cost of goods sold per outlet from the stock ledger (see lib/outlet-profit).
  const cogsMap = await cogsByOutlet(start, end);

  const rows = outlets.map((o) => {
    const id = o._id.toString();
    const sales = salesMap.get(id) || { salesTotal: 0, salesCount: 0 };
    const exp = expenseMap.get(id) || { expenseTotal: 0, expenseCount: 0 };
    const cogs = cogsMap.get(id) || 0;
    const grossProfit = sales.salesTotal - cogs;
    return {
      outletId: id,
      name: o.name || "",
      code: o.code || "",
      isActive: o.isActive !== false,
      salesTotal: sales.salesTotal,
      salesCount: sales.salesCount,
      cogs,
      grossProfit,
      marginPct: marginPct(grossProfit, sales.salesTotal),
      expenseTotal: exp.expenseTotal,
      expenseCount: exp.expenseCount,
      // Net profit is gross profit minus operating expenses (not just
      // sales minus expenses — that ignored the cost of the goods).
      net: grossProfit - exp.expenseTotal,
    };
  });

  // Sort by net profit desc so the most profitable outlets are on top.
  rows.sort((a, b) => b.net - a.net);

  const totals = rows.reduce(
    (acc, r) => {
      acc.salesTotal += r.salesTotal;
      acc.cogs += r.cogs;
      acc.grossProfit += r.grossProfit;
      acc.expenseTotal += r.expenseTotal;
      acc.net += r.net;
      acc.salesCount += r.salesCount;
      return acc;
    },
    {
      salesTotal: 0,
      cogs: 0,
      grossProfit: 0,
      expenseTotal: 0,
      net: 0,
      salesCount: 0,
    }
  );

  return NextResponse.json({
    success: true,
    range: { start: start.toISOString(), end: end.toISOString() },
    rows,
    totals: {
      ...totals,
      marginPct: marginPct(totals.grossProfit, totals.salesTotal),
    },
  });
}
