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
  const dayStart = outletExpenseDay(req.nextUrl.searchParams.get("date") ?? undefined);
  if (!dayStart) return NextResponse.json({ success: false, message: "Select a valid business date, not in the future." }, { status: 400 });
  const [expenses, expenseTypes] = await Promise.all([
    ExpenseModel.find({
      outletId,
      expenseCategory: "OUTLET",
      isActive: true,
      expenseDate: { $gte: dayStart, $lt: addDays(dayStart, 1) },
    })
      .sort({ createdAt: -1 })
      .select("name type amount expenseDate remarks")
      .lean<Array<{ _id: { toString(): string }; name: string; type: string; amount: number; expenseDate: Date; remarks?: string }>>(),
    ExpenseTypeModel.find({ isActive: true }).sort({ name: 1 }).select("code name").lean(),
  ]);

  return NextResponse.json({
    success: true,
    data: expenses.map((item) => ({
      id: item._id.toString(),
      name: item.name,
      type: item.type,
      amount: Number(item.amount || 0),
      expenseDate: item.expenseDate,
      remarks: item.remarks || "",
    })),
    expenseTypes: expenseTypes.map((item) => ({ code: item.code, name: item.name })),
    summary: { total: expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0) },
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
  } | null;
  const outletId = String(body?.outletId || "");
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
  if (!(await ExpenseTypeModel.exists({ code: type, isActive: true }))) {
    return NextResponse.json({ success: false, message: "Select a valid active expense type." }, { status: 400 });
  }

  const expense = await ExpenseModel.create({
    name,
    expenseCategory: "OUTLET",
    type,
    expenseDate,
    amount,
    outletId,
    remarks: [`WEB POS EXPENSE OUTLET:${outletId}`, notes].filter(Boolean).join(" | "),
    createdBy: session!.user.id,
    isActive: true,
  });

  return NextResponse.json({
    success: true,
    message: "Outlet expense recorded.",
    expense: { id: expense._id.toString(), name, type, amount },
  });
}
