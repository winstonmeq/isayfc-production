import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { addDays, startOfDayManila } from "@/lib/date-utils";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { requirePermission } from "@/lib/require-permission";
import ExpenseModel, { type ExpenseType } from "@/models/Expense";

export const dynamic = "force-dynamic";

const EXPENSE_TYPES: readonly ExpenseType[] = [
  "DELIVERY_EXPENSES",
  "CLEANING_SUPPLIES",
  "TRANSPORTATION_EXPENSES",
  "MARINATE_EXPENSES",
  "OFFICE_SUPPLIES",
  "REPAIR_AND_MAINTENANCE",
  "SALARIES",
  "INCENTIVES_AND_ALLOWANCES",
  "OTHERS",
];

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

  const outletId = req.nextUrl.searchParams.get("outletId") || "";
  const current = await context(outletId, session!.user.id);
  if (!current) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }
  const dayStart = startOfDayManila();
  const expenses = await ExpenseModel.find({
    outletId,
    expenseCategory: "OUTLET",
    isActive: true,
    expenseDate: { $gte: dayStart, $lt: addDays(dayStart, 1) },
  })
    .sort({ createdAt: -1 })
    .select("name type amount expenseDate remarks")
    .lean<Array<{ _id: { toString(): string }; name: string; type: string; amount: number; expenseDate: Date; remarks?: string }>>();

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
    summary: { total: expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0) },
  });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requirePermission("pos.manage");
  if (response) return response;
  await dbConnect();

  const body = await req.json().catch(() => null) as {
    outletId?: string;
    name?: string;
    type?: string;
    amount?: number;
    remarks?: string;
  } | null;
  const outletId = String(body?.outletId || "");
  const current = await context(outletId, session!.user.id);
  if (!current) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }
  const name = String(body?.name || "").trim();
  const amount = Number(body?.amount);
  const requestedType = String(body?.type || "OTHERS") as ExpenseType;
  const type = EXPENSE_TYPES.includes(requestedType) ? requestedType : "OTHERS";
  const notes = String(body?.remarks || "").trim();
  if (!name) {
    return NextResponse.json({ success: false, message: "Expense description is required." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ success: false, message: "Enter a valid expense amount." }, { status: 400 });
  }

  const expense = await ExpenseModel.create({
    name,
    expenseCategory: "OUTLET",
    type,
    expenseDate: new Date(),
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
