// app/api/mobile/expenses/route.ts
import { NextRequest, NextResponse } from "next/server";

import { requireMobileAuth } from "@/lib/mobile-auth";
import connectDb from "@/lib/mongodb";
import ExpenseModel from "@/models/Expense";
import type { ExpenseType } from "@/models/Expense";
import CashShiftModel from "@/models/CashShift";

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

type ExpenseListRow = {
  _id: { toString: () => string };
  name?: string;
  type?: string;
  amount?: number;
  createdAt?: Date;
};

export async function GET(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, [
    "expenses-bodega.view",
    "expenses-bodega.manage",
  ]);
  if (response) return response;

  await connectDb();

  // Expenses recorded by this cashier for the current open shift.
  const shift = await CashShiftModel.findOne({
    cashierId: user.id,
    status: "OPEN",
  })
    .select("_id")
    .lean<{ _id: { toString: () => string } }>();

  if (!shift) {
    return NextResponse.json({ success: true, data: [], summary: { total: 0 } });
  }

  const expenses = await ExpenseModel.find({
    isActive: true,
    remarks: { $regex: `SHIFT:${shift._id.toString()}` },
  })
    .sort({ createdAt: -1 })
    .lean<ExpenseListRow[]>();

  let total = 0;
  const data = expenses.map((e) => {
    total += Number(e.amount || 0);
    return {
      id: e._id.toString(),
      name: e.name || "",
      type: e.type || "OTHERS",
      amount: Number(e.amount || 0),
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : undefined,
    };
  });

  return NextResponse.json({ success: true, data, summary: { total } });
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, "expenses-bodega.manage");
  if (response) return response;

  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  await connectDb();

  let body: { name?: string; amount?: number; type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body." },
      { status: 400 }
    );
  }

  const name = String(body?.name || "").trim();
  const amount = Number(body?.amount);
  const requestedType = String(body?.type);
  const type: ExpenseType = EXPENSE_TYPES.includes(requestedType as ExpenseType)
    ? (requestedType as ExpenseType)
    : "OTHERS";

  if (!name) {
    return NextResponse.json(
      { success: false, message: "Expense description is required." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { success: false, message: "Enter a valid amount." },
      { status: 400 }
    );
  }

  // Expenses are cash-drawer movements, so require an open shift. Otherwise the
  // outlet can spend cash that never appears in the close-shift variance.
  const shift = await CashShiftModel.findOne({
    cashierId: user.id,
    outletId: user.outlet.id,
    status: "OPEN",
  })
    .select("_id")
    .lean<{ _id: { toString: () => string } }>();

  if (!shift) {
    return NextResponse.json(
      { success: false, message: "Open a cash shift before recording expenses." },
      { status: 409 }
    );
  }

  const shiftId = shift._id.toString();
  const shiftTag = ` SHIFT:${shiftId}`;

  const expense = await ExpenseModel.create({
    name,
    expenseCategory: "BODEGA",
    type,
    expenseDate: new Date(),
    amount,
    // First-class fields; remarks tag kept for backward compatibility.
    outletId: user.outlet.id,
    shiftId,
    remarks: `MOBILE EXPENSE OUTLET:${user.outlet.id}${shiftTag}`,
    createdBy: user.id,
    isActive: true,
  });

  return NextResponse.json({
    success: true,
    message: "Expense recorded.",
    expense: {
      id: expense._id.toString(),
      name: expense.name,
      amount: expense.amount,
    },
  });
}
