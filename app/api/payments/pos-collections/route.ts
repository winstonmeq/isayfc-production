import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { cleanString, escapeRegex, getPagination } from "@/lib/crud-utils";
import { requirePermission } from "@/lib/require-permission";
import { outletSaleMatchClauses } from "@/lib/sale-origin";
import CashShiftModel from "@/models/CashShift";
import OutletModel from "@/models/Outlet";
import SaleModel from "@/models/Sale";
import UserModel from "@/models/User";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("payments.view");
  if (response) return response;

  await dbConnect();
  void CashShiftModel;
  void OutletModel;
  void UserModel;

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));
  const outletId = cleanString(searchParams.get("outletId"));
  const receipt = cleanString(searchParams.get("receipt"));

  const filter: Record<string, any> = {
    isVoided: false,
    $or: outletSaleMatchClauses(),
  };

  if (dateFrom || dateTo) {
    filter.saleDate = {};
    if (dateFrom) filter.saleDate.$gte = new Date(`${dateFrom}T00:00:00+08:00`);
    if (dateTo) filter.saleDate.$lte = new Date(`${dateTo}T23:59:59.999+08:00`);
  }
  if (outletId && outletId !== "ALL" && isValidObjectId(outletId)) {
    filter.outletId = outletId;
  }
  if (receipt) {
    filter.receiptNumber = { $regex: escapeRegex(receipt), $options: "i" };
  }

  const [sales, total, totals, outlets] = await Promise.all([
    SaleModel.find(filter)
      .populate("outletId", "name code")
      .populate("createdBy", "name username")
      .populate("shiftId", "status openedAt closedAt")
      .sort({ saleDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SaleModel.countDocuments(filter),
    SaleModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paidAmount" },
          transactionCount: { $sum: 1 },
        },
      },
    ]),
    OutletModel.find({ isActive: true })
      .select("name code")
      .sort({ name: 1 })
      .lean(),
  ]);

  const summary = totals[0] || {
    totalSales: 0,
    totalPaid: 0,
    transactionCount: 0,
  };

  return NextResponse.json({
    success: true,
    data: sales.map((sale: any) => ({
      _id: sale._id.toString(),
      saleDate: sale.saleDate?.toISOString?.() || "",
      receiptNumber: sale.receiptNumber || "",
      outletCode: sale.outletId?.code || "",
      outletName: sale.outletId?.name || "",
      cashierName:
        sale.createdBy?.name || sale.createdBy?.username || "Unknown cashier",
      shiftId: sale.shiftId?._id?.toString?.() || sale.shiftId?.toString?.() || "",
      shiftStatus: sale.shiftId?.status || "UNKNOWN",
      paymentMethod: sale.paymentMethod || "CASH",
      totalAmount: Number(sale.totalAmount || 0),
      paidAmount: Number(sale.paidAmount || 0),
      cashReceived: Number(sale.cashReceived ?? sale.paidAmount ?? 0),
      change: Number(sale.change || 0),
      status: sale.status || "PAID",
    })),
    summary: {
      totalSales: Number(summary.totalSales || 0),
      totalPaid: Number(summary.totalPaid || 0),
      transactionCount: Number(summary.transactionCount || 0),
    },
    outlets: outlets.map((outlet) => ({
      _id: outlet._id.toString(),
      name: outlet.name,
      code: outlet.code,
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}
