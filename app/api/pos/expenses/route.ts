import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { addDays } from "@/lib/date-utils";
import { outletExpenseDay } from "@/lib/business-flow";
import { ensureDefaultExpenseTypes, expenseTypeCode } from "@/lib/expense-types";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { requirePermission } from "@/lib/require-permission";
import ExpenseModel, { type ExpenseType } from "@/models/Expense";
import ExpenseTypeModel from "@/models/ExpenseType";
import CashShiftModel from "@/models/CashShift";
import { outletExpenseActions } from "@/lib/outlet-expense-actions";

export const dynamic = "force-dynamic";

async function context(outletId: string, userId: string) {
  if (!isValidObjectId(outletId)) return null;
  const outlet = await findAuthorizedPosOutlet(userId, outletId);
  if (!outlet) return null;
  return { outlet };
}

export async function GET(req: NextRequest) {
  const { session, response } = await requirePermission("pos.view");
  if (response) return response;
  await dbConnect();
  await ensureDefaultExpenseTypes();

  const outletId = req.nextUrl.searchParams.get("outletId") || "";
  const current = await context(outletId, session!.user.id);
  if (!current) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }
  const dayStart = outletExpenseDay(req.nextUrl.searchParams.get("dateFrom") ?? req.nextUrl.searchParams.get("date") ?? undefined);
  const lastDay = outletExpenseDay(req.nextUrl.searchParams.get("dateTo") ?? req.nextUrl.searchParams.get("date") ?? req.nextUrl.searchParams.get("dateFrom") ?? undefined);
  if (!dayStart || !lastDay || lastDay < dayStart) return NextResponse.json({ success: false, message: "Select a valid business date range, not in the future." }, { status: 400 });
  const [expenses, expenseTypes] = await Promise.all([
    ExpenseModel.find({
      outletId,
      expenseCategory: "OUTLET",
      isActive: true,
      expenseDate: { $gte: dayStart, $lt: addDays(lastDay, 1) },
    })
      .sort({ createdAt: -1 })
      .select("name type amount expenseDate remarks deductFromCashSale expenseNature origin consumedQuantity consumptionUnit consumptionUnitCost consumptionUsage updatedAt")
      .lean<Array<{
        _id: { toString(): string };
        name: string;
        type: string;
        amount: number;
        expenseDate: Date;
        remarks?: string;
        deductFromCashSale?: boolean;
        expenseNature?: "CASH_SALE_EXPENSE" | "PERIOD_EXPENSE";
        origin?: string;
        consumedQuantity?: number;
        consumptionUnit?: string;
        consumptionUnitCost?: number;
        consumptionUsage?: string;
        updatedAt: Date;
      }>>(),
    ExpenseTypeModel.find({ isActive: true, code: { $ne: "OWNER_OUTLET_DELIVERY" } }).sort({ name: 1 }).select("code name").lean(),
  ]);

  const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const cashExpenses = expenses
    .filter((item) => item.deductFromCashSale !== false)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const periodExpenses = expenses
    .filter((item) => item.deductFromCashSale === false)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return NextResponse.json({
    success: true,
    canManage: session?.user.role === "ADMIN" || !!session?.user.permissions?.includes("pos.manage"),
    data: expenses.map((item) => ({
      id: item._id.toString(),
      name: item.name,
      type: item.type,
      amount: Number(item.amount || 0),
      expenseDate: item.expenseDate,
      remarks: item.remarks || "",
      deductFromCashSale: item.deductFromCashSale !== false,
      expenseNature: item.expenseNature || (item.deductFromCashSale === false ? "PERIOD_EXPENSE" : "CASH_SALE_EXPENSE"),
      origin: item.origin || "MANUAL",
      quantity: item.consumedQuantity,
      unit: item.consumptionUnit,
      unitCost: item.consumptionUnitCost,
      usage: item.consumptionUsage,
      updatedAt: item.updatedAt,
      ...outletExpenseActions(item.origin),
    })),
    expenseTypes: expenseTypes.map((item) => ({ code: item.code, name: item.name })),
    summary: {
      total,
      cashExpenses,
      periodExpenses,
    },
  });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requirePermission("pos.manage");
  if (response) return response;
  await dbConnect();
  await ensureDefaultExpenseTypes();

  const body = await req.json().catch(() => null) as {
    outletId?: string;
    name?: string;
    type?: string;
    amount?: number;
    remarks?: string;
    expenseDate?: string;
    deductFromCashSale?: boolean;
    expenseNature?: "CASH_SALE_EXPENSE" | "PERIOD_EXPENSE";
  } | null;
  const outletId = String(body?.outletId || "");
  if (body?.expenseNature && !["CASH_SALE_EXPENSE", "PERIOD_EXPENSE"].includes(body.expenseNature)) return NextResponse.json({ success: false, message: "Use Stock Usage to record inventory consumption." }, { status: 400 });
  const current = await context(outletId, session!.user.id);
  if (!current) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }
  const name = String(body?.name || "").trim();
  const amount = Number(body?.amount);
  const type = (expenseTypeCode(body?.type) || "OTHERS") as ExpenseType;
  const notes = String(body?.remarks || "").trim();
  const expenseDate = outletExpenseDay(body?.expenseDate);
  if (!expenseDate) return NextResponse.json({ success: false, message: "Select a valid expense date, not in the future." }, { status: 400 });
  if (!name) {
    return NextResponse.json({ success: false, message: "Expense description is required." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ success: false, message: "Enter a valid expense amount." }, { status: 400 });
  }
  if (type === "OWNER_OUTLET_DELIVERY" || !(await ExpenseTypeModel.exists({ code: type, isActive: true }))) {
    return NextResponse.json({ success: false, message: "Select a valid active expense type." }, { status: 400 });
  }

  // Determine expense deduction type:
  // "CASH_SALE_EXPENSE" (default) deducts directly from cash sales & drawer.
  // "PERIOD_EXPENSE" is deducted in whole day / week / monthly P&L (e.g. electricity, rent, salaries).
  const isPeriod = body?.expenseNature === "PERIOD_EXPENSE" || body?.deductFromCashSale === false;
  const deductFromCashSale = !isPeriod;
  const expenseNature = isPeriod ? "PERIOD_EXPENSE" : "CASH_SALE_EXPENSE";

  let shiftId: any = undefined;
  if (deductFromCashSale) {
    const openShift = await CashShiftModel.findOne({ cashierId: session!.user.id, outletId, status: "OPEN" });
    if (openShift) {
      shiftId = openShift._id;
    }
  }

  const expense = await ExpenseModel.create({
    name,
    expenseCategory: "OUTLET",
    type,
    expenseDate,
    amount,
    outletId,
    shiftId,
    deductFromCashSale,
    expenseNature,
    remarks: [`WEB POS EXPENSE OUTLET:${outletId}`, notes].filter(Boolean).join(" | "),
    createdBy: session!.user.id,
    isActive: true,
  });

  return NextResponse.json({
    success: true,
    message: isPeriod
      ? "Period expense recorded (deducted from period profit, not daily cash sales)."
      : "Cash sale expense recorded (deducted directly from outlet cash sales & drawer).",
    expense: {
      id: expense._id.toString(),
      name,
      type,
      amount,
      deductFromCashSale,
      expenseNature,
    },
  });
}
