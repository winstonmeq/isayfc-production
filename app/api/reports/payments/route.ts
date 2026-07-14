// app/api/reports/payments/route.ts
//
// Standard Payments Report: a collections register (payments received in the
// period, with applied/unapplied breakdown and daily subtotals) PLUS an
// accounts-receivable aging summary (outstanding sale balances per customer,
// bucketed current / 1-30 / 31-60 / 61-90 / 90+ days by sale date).
//
// A/R aging is "as of now" and ignores the date range; the collections
// register uses the selected range.

import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { parseReportRange, roundMoney } from "@/lib/report-utils";
import { manilaDateString } from "@/lib/date-utils";
import PaymentModel from "@/models/Payment";
import SaleModel from "@/models/Sale";
import CustomerModel from "@/models/Customer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function ageBucket(days: number): "current" | "d30" | "d60" | "d90" | "d90plus" {
  if (days <= 0) return "current";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  if (days <= 90) return "d90";
  return "d90plus";
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("reports.payments");
  if (response) return response;

  await dbConnect();
  void CustomerModel; // register for populate

  const { searchParams } = new URL(req.url);
  const { start, end } = parseReportRange(searchParams);

  // --- Collections register (payments received in range) ---
  const payments = await PaymentModel.find({
    isVoided: false,
    paymentDate: { $gte: start, $lt: end },
  })
    .populate("customerId", "name")
    .select(
      "paymentDate amount appliedAmount unappliedAmount referenceNumber customerId"
    )
    .sort({ paymentDate: 1, createdAt: 1 })
    .lean<
      Array<{
        _id: { toString: () => string };
        paymentDate?: Date;
        amount?: number;
        appliedAmount?: number;
        unappliedAmount?: number;
        referenceNumber?: string;
        customerId?: { name?: string } | null;
      }>
    >();

  const collections = payments.map((p) => {
    const date = p.paymentDate ? new Date(p.paymentDate) : null;
    return {
      id: p._id.toString(),
      paymentDate: date ? date.toISOString() : "",
      day: date ? manilaDateString(date) : "",
      customerName: p.customerId?.name || "—",
      referenceNumber: String(p.referenceNumber || ""),
      amount: roundMoney(Number(p.amount || 0)),
      applied: roundMoney(Number(p.appliedAmount || 0)),
      unapplied: roundMoney(Number(p.unappliedAmount || 0)),
    };
  });

  const collDailyMap = new Map<
    string,
    { day: string; count: number; amount: number; applied: number; unapplied: number }
  >();
  for (const c of collections) {
    const cur =
      collDailyMap.get(c.day) ||
      { day: c.day, count: 0, amount: 0, applied: 0, unapplied: 0 };
    cur.count += 1;
    cur.amount = roundMoney(cur.amount + c.amount);
    cur.applied = roundMoney(cur.applied + c.applied);
    cur.unapplied = roundMoney(cur.unapplied + c.unapplied);
    collDailyMap.set(c.day, cur);
  }
  const collectionsDaily = [...collDailyMap.values()].sort((a, b) =>
    a.day.localeCompare(b.day)
  );

  const collectionsGrand = collections.reduce(
    (acc, c) => {
      acc.count += 1;
      acc.amount = roundMoney(acc.amount + c.amount);
      acc.applied = roundMoney(acc.applied + c.applied);
      acc.unapplied = roundMoney(acc.unapplied + c.unapplied);
      return acc;
    },
    { count: 0, amount: 0, applied: 0, unapplied: 0 }
  );

  // --- A/R aging (open sale balances, as of now) ---
  const openSales = await SaleModel.find({
    isVoided: false,
    balance: { $gt: 0 },
  })
    .populate("customerId", "name")
    .select("customerId balance saleDate")
    .lean<
      Array<{
        customerId?: { _id?: { toString: () => string }; name?: string } | null;
        balance?: number;
        saleDate?: Date;
      }>
    >();

  type Aging = {
    customerId: string;
    customerName: string;
    current: number;
    d30: number;
    d60: number;
    d90: number;
    d90plus: number;
    total: number;
  };

  const now = Date.now();
  const agingMap = new Map<string, Aging>();
  for (const s of openSales) {
    const custId = s.customerId?._id?.toString() || "unknown";
    const name = s.customerId?.name || "Walk-in / No customer";
    const bal = roundMoney(Number(s.balance || 0));
    if (bal <= 0) continue;

    const saleTime = s.saleDate ? new Date(s.saleDate).getTime() : now;
    const days = Math.floor((now - saleTime) / (1000 * 60 * 60 * 24));
    const bucket = ageBucket(days);

    const row =
      agingMap.get(custId) ||
      {
        customerId: custId,
        customerName: name,
        current: 0,
        d30: 0,
        d60: 0,
        d90: 0,
        d90plus: 0,
        total: 0,
      };
    row[bucket] = roundMoney(row[bucket] + bal);
    row.total = roundMoney(row.total + bal);
    agingMap.set(custId, row);
  }

  const aging = [...agingMap.values()].sort((a, b) => b.total - a.total);

  const agingGrand = aging.reduce(
    (acc, r) => {
      acc.current = roundMoney(acc.current + r.current);
      acc.d30 = roundMoney(acc.d30 + r.d30);
      acc.d60 = roundMoney(acc.d60 + r.d60);
      acc.d90 = roundMoney(acc.d90 + r.d90);
      acc.d90plus = roundMoney(acc.d90plus + r.d90plus);
      acc.total = roundMoney(acc.total + r.total);
      return acc;
    },
    { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 }
  );

  return NextResponse.json({
    success: true,
    range: { start: start.toISOString(), end: end.toISOString() },
    generatedAt: manilaDateString(),
    collections,
    collectionsDaily,
    collectionsGrand,
    aging,
    agingGrand,
  });
}
