import { NextRequest, NextResponse } from "next/server";
import { menuStock } from "@/lib/business-flow";
import { OutletEmployeeCash } from "@/models/OutletEmployeeFinance";
import { outletCashSummary } from "@/lib/employee-finance";

import { sumShiftExpenses, sumShiftSales } from "@/lib/cash-shift";
import { addDays, startOfDayManila } from "@/lib/date-utils";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import CashShiftModel from "@/models/CashShift";
import OutletModel from "@/models/Outlet";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletMenuItemModel from "@/models/OutletMenuItem";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";
import ExpenseModel from "@/models/Expense";
import UserModel from "@/models/User";

export const dynamic = "force-dynamic";

async function allowedOutlet(userId: string, requestedId: string) {
  const user = await UserModel.findById(userId).select("role outletId").lean<{
    role?: string;
    outletId?: { toString: () => string };
  }>();
  if (!user) return null;
  const assigned = user.outletId?.toString() || "";
  if (String(user.role || "").toUpperCase() !== "ADMIN" && requestedId !== assigned) {
    return null;
  }
  return OutletModel.findOne({ _id: requestedId, isActive: true, status: "ACTIVE" }).lean();
}

export async function GET(req: NextRequest) {
  const { session, response } = await requirePermission(["pos.view", "pos.manage"]);
  if (response) return response;
  await dbConnect();

  const user = await UserModel.findById(session!.user.id)
    .select("role outletId")
    .lean<{ role?: string; outletId?: { toString: () => string } }>();
  const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";
  const assignedOutletId = user?.outletId?.toString() || "";
  const outlets = await OutletModel.find({
    isActive: true,
    status: "ACTIVE",
    ...(isAdmin ? {} : { _id: assignedOutletId }),
  })
    .sort({ name: 1 })
    .select("name code")
    .lean<Array<{ _id: { toString: () => string }; name: string; code: string }>>();

  const requested = new URL(req.url).searchParams.get("outletId") || assignedOutletId || outlets[0]?._id.toString();
  const outlet = requested ? await allowedOutlet(session!.user.id, requested) : null;
  if (!outlet) {
    return NextResponse.json({
      success: true,
      outlets: outlets.map((row) => ({ id: row._id.toString(), name: row.name, code: row.code })),
      outletId: "",
      menu: [],
      shift: null,
      recentSales: [],
    });
  }

  const outletId = outlet._id.toString();
  const dayStart = startOfDayManila();
  const dayEnd = addDays(dayStart, 1);
  const [menu, inventory, shift, recentSales, dailySales, dailyExpenses, employeeCash] = await Promise.all([
    OutletMenuItemModel.find({ outletId, isActive: true, isAvailable: true })
      .sort({ category: 1, sortOrder: 1, name: 1 })
      .lean<any[]>(),
    OutletInventoryModel.find({ outletId, isActive: true }).lean<any[]>(),
    CashShiftModel.findOne({ cashierId: session!.user.id, outletId, status: "OPEN" }).lean<any>(),
    SaleModel.find({ outletId, source: "OUTLET", channel: "WEB", isVoided: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(8)
      .select("receiptNumber totalAmount totalQty createdAt")
      .lean<any[]>(),
    SaleModel.find({ outletId, source: "OUTLET", isVoided: { $ne: true }, saleDate: { $gte: dayStart, $lt: dayEnd } })
      .sort({ saleDate: 1, createdAt: 1 })
      .select("receiptNumber totalAmount totalQty paidAmount saleDate shiftId paymentMethod employeeName")
      .lean<any[]>(),
    ExpenseModel.find({ outletId, expenseCategory: "OUTLET", isActive: true, expenseDate: { $gte: dayStart, $lt: dayEnd } })
      .select("amount")
      .lean<any[]>(),
    OutletEmployeeCash.find({ outletId, businessDate: { $gte: dayStart, $lt: dayEnd } }).select("kind amount").lean(),
  ]);

  const dailySaleIds = dailySales.map((row) => row._id);
  const dailyLines = dailySaleIds.length
    ? await SaleLineModel.find({ saleId: { $in: dailySaleIds }, source: "OUTLET" }).select("saleId unitCost baseQty qty productName").lean<any[]>()
    : [];
  const dailyRevenue = dailySales.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
  const dailyCogs = dailyLines.reduce((sum, row) => sum + Number(row.unitCost || 0) * Number(row.baseQty ?? row.qty ?? 0), 0);
  const cogsBySale = new Map<string, number>();
  for (const line of dailyLines) {
    const saleId = line.saleId?.toString?.() || String(line.saleId || "");
    cogsBySale.set(
      saleId,
      (cogsBySale.get(saleId) || 0) +
        Number(line.unitCost || 0) * Number(line.baseQty ?? line.qty ?? 0)
    );
  }
  const dailyExpenseTotal = dailyExpenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const menuRows = menu.map((row) => {
    const stock = menuStock(inventory, row._id);
    return {
      id: row._id.toString(),
      name: row.name,
      category: row.category || "Others",
      price: Number(row.price || 0),
      imageUrl: row.imageUrl || "",
      stockQty: Number(stock?.stockQty || 0),
      unit: stock?.unitLabel || "QTY",
    };
  });

  let shiftPayload = null;
  if (shift) {
    const [{ total: cashSales, count: salesCount }, { total: cashExpenses }] = await Promise.all([
      sumShiftSales(shift._id.toString()),
      sumShiftExpenses(shift._id.toString()),
    ]);
    shiftPayload = {
      id: shift._id.toString(),
      openingFloat: Number(shift.openingFloat || 0),
      cashSales,
      cashExpenses,
      salesCount,
      expectedCash: Number(shift.openingFloat || 0) + cashSales - cashExpenses,
      openedAt: shift.openedAt,
    };
  }

  return NextResponse.json({
    success: true,
    outlets: outlets.map((row) => ({ id: row._id.toString(), name: row.name, code: row.code })),
    outletId,
    menu: menuRows,
    inventory: inventory.map((row) => ({
      id: row._id.toString(),
      productName: row.productName,
      categoryName: row.categoryName || "",
      stockQty: Number(row.stockQty || 0),
      unitLabel: row.unitLabel || "QTY",
      packSize: Number(row.packSize || 0),
      buyingPrice: Number(row.buyingPrice || 0),
      productSource:
        row.originType === "OUTSIDE_PURCHASE" ? "OUTSIDE PURCHASE" : row.originType === "OUTLET_PRODUCTION" ||
        String(row.remarks || "").includes("MIXING OUTPUT")
          ? String((outlet as any).code || (outlet as any).name || "OUTLET").toUpperCase()
          : row.productSource,
    })),
    shift: shiftPayload,
    recentSales: recentSales.map((row) => ({
      id: row._id.toString(),
      receiptNumber: row.receiptNumber,
      totalAmount: Number(row.totalAmount || 0),
      totalQty: Number(row.totalQty || 0),
      createdAt: row.createdAt,
    })),
    dailyReport: {
      cash: outletCashSummary(
        dailySales.filter((sale) => sale.paymentMethod === "CASH").reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0),
        employeeCash.filter((row) => row.kind === "EMPLOYEE_COLLECTION").reduce((sum, row) => sum + Number(row.amount), 0),
        dailyExpenseTotal,
        employeeCash.filter((row) => row.kind === "EMPLOYEE_REIMBURSEMENT").reduce((sum, row) => sum + Number(row.amount), 0),
      ),
      date: dayStart.toISOString(),
      revenue: dailyRevenue,
      cogs: dailyCogs,
      expenses: dailyExpenseTotal,
      grossProfit: dailyRevenue - dailyCogs,
      netProfit: dailyRevenue - dailyCogs - dailyExpenseTotal,
      transactions: dailySales.map((row) => {
        const cogs = cogsBySale.get(row._id.toString()) || 0;
        const sales = Number(row.totalAmount || 0);
        return {
          id: row._id.toString(),
          receiptNumber: row.receiptNumber,
          totalAmount: sales,
          totalQty: Number(row.totalQty || 0),
          paymentMethod: row.paymentMethod,
          paidAmount: Number(row.paidAmount || 0),
          balance: Math.max(0, sales - Number(row.paidAmount || 0)),
          employeeName: row.employeeName,
          cogs,
          grossProfit: sales - cogs,
          saleDate: row.saleDate,
        };
      }),
    },
  });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requirePermission("pos.manage");
  if (response) return response;
  await dbConnect();

  const body = await req.json().catch(() => null) as null | {
    action?: string;
    outletId?: string;
    openingFloat?: number;
    countedCash?: number;
    remarks?: string;
  };
  const outletId = String(body?.outletId || "");
  if (!outletId || !(await allowedOutlet(session!.user.id, outletId))) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }

  if (body?.action === "OPEN_SHIFT") {
    const openingFloat = Number(body.openingFloat);
    if (!Number.isFinite(openingFloat) || openingFloat < 0) {
      return NextResponse.json({ success: false, message: "Enter a valid opening cash amount." }, { status: 400 });
    }
    const existing = await CashShiftModel.findOne({ cashierId: session!.user.id, status: "OPEN" });
    if (existing) {
      return NextResponse.json({ success: false, message: "Close your existing shift first." }, { status: 409 });
    }
    await CashShiftModel.create({
      outletId,
      cashierId: session!.user.id,
      cashierName: session!.user.name || session!.user.username,
      openingFloat,
      openedAt: new Date(),
      status: "OPEN",
      openRemarks: String(body.remarks || "").trim(),
    });
    return NextResponse.json({ success: true, message: "Cash shift opened." });
  }

  if (body?.action === "CLOSE_SHIFT") {
    const countedCash = Number(body.countedCash);
    if (!Number.isFinite(countedCash) || countedCash < 0) {
      return NextResponse.json({ success: false, message: "Enter the counted cash amount." }, { status: 400 });
    }
    const shift = await CashShiftModel.findOne({ cashierId: session!.user.id, outletId, status: "OPEN" });
    if (!shift) {
      return NextResponse.json({ success: false, message: "No open shift found." }, { status: 404 });
    }
    const [{ total: cashSales, count: salesCount }, { total: cashExpenses }] = await Promise.all([
      sumShiftSales(shift._id.toString()),
      sumShiftExpenses(shift._id.toString()),
    ]);
    const expectedCash = Number(shift.openingFloat || 0) + cashSales - cashExpenses;
    shift.status = "CLOSED";
    shift.cashSales = cashSales;
    shift.cashExpenses = cashExpenses;
    shift.salesCount = salesCount;
    shift.expectedCash = expectedCash;
    shift.countedCash = countedCash;
    shift.variance = countedCash - expectedCash;
    shift.closedAt = new Date();
    shift.closeRemarks = String(body.remarks || "").trim();
    await shift.save();
    return NextResponse.json({ success: true, message: `Shift closed. Variance: ${shift.variance.toFixed(2)}` });
  }

  return NextResponse.json({ success: false, message: "Unknown POS action." }, { status: 400 });
}
