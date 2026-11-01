// app/api/outlet-summary/[id]/route.ts
//
// Per-outlet profit drill-down for the owner. For one outlet over a date range:
//   - top products sold (qty, revenue, cost, gross profit) from the stock ledger
//   - expense breakdown by type
//   - a daily series of sales / expenses / net
//
// HEADER + DAILY revenue comes from Sale.totalAmount (attributed by first-class
// outletId or the legacy OUTLET: remarks tag) — the SAME source as the outlet
// list, so the drawer reconciles with the row the user clicked. The stock
// ledger cannot serve as a revenue source: menu items with no components write
// no ledger rows, and pricing ledger qty at the ingredient's current
// sellingPrice both misprices and rewrites history.
//
// COGS comes from the SALE stock ledger priced at the outlet's buyingPrice.
// The per-product table is a top-100 movement/cost view; header totals are
// computed from UNCAPPED aggregations, never from the capped table.

import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { marginPct, parseRange } from "@/lib/outlet-profit";
import { manilaDateString } from "@/lib/date-utils";
import { outletSaleMatchClauses } from "@/lib/sale-origin";
import OutletModel from "@/models/Outlet";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import SaleModel from "@/models/Sale";
import ExpenseModel from "@/models/Expense";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("reports.outlet-comparison");
  if (response) return response;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid outlet id." },
      { status: 400 }
    );
  }

  await dbConnect();

  const outlet = await OutletModel.findById(id)
    .select("name code isActive status")
    .lean<{ _id: { toString: () => string }; name?: string; code?: string }>();
  if (!outlet) {
    return NextResponse.json(
      { success: false, message: "Outlet not found." },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(req.url);
  const { start, end } = parseRange(searchParams);

  // 1) Products sold, priced from the matching OutletInventory.
  const products = await OutletStockTransactionModel.aggregate<{
    _id: string;
    qty?: number;
    revenue?: number;
    cost?: number;
  }>([
    {
      $match: {
        outletId: { $eq: outlet._id },
        type: "SALE",
        transactionDate: { $gte: start, $lt: end },
      },
    },
    {
      $lookup: {
        from: "outletinventories",
        localField: "outletInventoryId",
        foreignField: "_id",
        as: "inv",
      },
    },
    {
      $project: {
        productName: 1,
        quantity: 1,
        buyingPrice: {
          $cond: [
            { $gt: [{ $ifNull: ["$unitCost", 0] }, 0] },
            "$unitCost",
            { $ifNull: [{ $arrayElemAt: ["$inv.buyingPrice", 0] }, 0] },
          ],
        },
        sellingPrice: {
          $ifNull: [{ $arrayElemAt: ["$inv.sellingPrice", 0] }, 0],
        },
      },
    },
    {
      $group: {
        _id: "$productName",
        qty: { $sum: "$quantity" },
        revenue: { $sum: { $multiply: ["$quantity", "$sellingPrice"] } },
        cost: { $sum: { $multiply: ["$quantity", "$buyingPrice"] } },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 100 },
  ]);

  const productRows = products.map((p) => {
    const revenue = Number(p.revenue || 0);
    const cost = Number(p.cost || 0);
    const grossProfit = revenue - cost;
    return {
      productName: String(p._id || ""),
      qty: Number(p.qty || 0),
      revenue,
      cost,
      grossProfit,
      marginPct: marginPct(grossProfit, revenue),
    };
  });

  // 2) Expense breakdown by type (first-class outletId, remarks fallback).
  const expenses = await ExpenseModel.aggregate<{
    _id: string;
    total?: number;
    count?: number;
  }>([
    {
      $match: {
        isActive: true,
        expenseDate: { $gte: start, $lt: end },
        $or: [
          { outletId: outlet._id },
          { remarks: { $regex: `OUTLET:${id}` } },
        ],
      },
    },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);

  const expenseRows = expenses.map((e) => ({
    type: String(e._id || "OTHERS"),
    total: Number(e.total || 0),
    count: Number(e.count || 0),
  }));

  // 3) Revenue from actual sales (same attribution as the outlet list:
  //    first-class outletId or the legacy OUTLET: tag) — one aggregation
  //    returning both the range total and the per-day series, UNCAPPED.
  const saleAgg = await SaleModel.aggregate<{
    total: Array<{ revenue?: number }>;
    byDay: Array<{ _id: string; revenue?: number }>;
  }>([
    {
      $match: {
        isVoided: { $ne: true },
        saleDate: { $gte: start, $lt: end },
        $and: [
          {
            $or: [
              { outletId: outlet._id },
              { remarks: { $regex: `OUTLET:${id}` } },
            ],
          },
          { $or: outletSaleMatchClauses() },
        ],
      },
    },
    {
      $facet: {
        total: [
          {
            $group: {
              _id: null,
              revenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
            },
          },
        ],
        byDay: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$saleDate",
                  timezone: "Asia/Manila",
                },
              },
              revenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
            },
          },
        ],
      },
    },
  ]);

  const saleTotalRevenue = Number(saleAgg[0]?.total?.[0]?.revenue || 0);
  const revenueByDay = saleAgg[0]?.byDay || [];

  // 4) Daily COGS from the stock ledger (component deductions × buyingPrice),
  //    also UNCAPPED — header COGS is summed from this, not the top-100 table.
  const costByDay = await OutletStockTransactionModel.aggregate<{
    _id: string;
    cost?: number;
  }>([
    {
      $match: {
        outletId: { $eq: outlet._id },
        type: "SALE",
        transactionDate: { $gte: start, $lt: end },
      },
    },
    {
      $lookup: {
        from: "outletinventories",
        localField: "outletInventoryId",
        foreignField: "_id",
        as: "inv",
      },
    },
    {
      $project: {
        day: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$transactionDate",
            timezone: "Asia/Manila",
          },
        },
        cost: {
          $multiply: [
            "$quantity",
            {
              $cond: [
                { $gt: [{ $ifNull: ["$unitCost", 0] }, 0] },
                "$unitCost",
                {
                  $ifNull: [
                    { $arrayElemAt: ["$inv.buyingPrice", 0] },
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
        _id: "$day",
        cost: { $sum: "$cost" },
      },
    },
  ]);

  const expensesByDay = await ExpenseModel.aggregate<{
    _id: string;
    expense?: number;
  }>([
    {
      $match: {
        isActive: true,
        expenseDate: { $gte: start, $lt: end },
        $or: [
          { outletId: outlet._id },
          { remarks: { $regex: `OUTLET:${id}` } },
        ],
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$expenseDate",
            timezone: "Asia/Manila",
          },
        },
        expense: { $sum: "$amount" },
      },
    },
  ]);

  const dayMap = new Map<
    string,
    { revenue: number; cost: number; expense: number }
  >();
  const dayEntry = (d: string) => {
    let cur = dayMap.get(d);
    if (!cur) {
      cur = { revenue: 0, cost: 0, expense: 0 };
      dayMap.set(d, cur);
    }
    return cur;
  };
  for (const r of revenueByDay) {
    dayEntry(String(r._id)).revenue = Number(r.revenue || 0);
  }
  for (const c of costByDay) {
    dayEntry(String(c._id)).cost = Number(c.cost || 0);
  }
  for (const e of expensesByDay) {
    dayEntry(String(e._id)).expense = Number(e.expense || 0);
  }

  const daily = [...dayMap.entries()]
    .map(([day, v]) => ({
      day,
      revenue: v.revenue,
      cost: v.cost,
      expense: v.expense,
      net: v.revenue - v.cost - v.expense,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // Totals for the detail header — from the UNCAPPED aggregations above.
  // Never sum the top-100 product table: outlets with more distinct products
  // would under-report and contradict the daily series on the same screen.
  const revenue = saleTotalRevenue;
  const cogs = costByDay.reduce((s, c) => s + Number(c.cost || 0), 0);
  const grossProfit = revenue - cogs;
  const expenseTotal = expenseRows.reduce((s, e) => s + e.total, 0);

  return NextResponse.json({
    success: true,
    outlet: {
      id: outlet._id.toString(),
      name: outlet.name || "",
      code: outlet.code || "",
    },
    range: { start: start.toISOString(), end: end.toISOString() },
    totals: {
      revenue,
      cogs,
      grossProfit,
      marginPct: marginPct(grossProfit, revenue),
      expenseTotal,
      net: grossProfit - expenseTotal,
      generatedAt: manilaDateString(),
    },
    products: productRows,
    expenses: expenseRows,
    daily,
  });
}
