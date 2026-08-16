// app/api/mobile/expenses/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

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
    "sales.manage",
  ]);
  if (response) return response;

  await connectDb();

  // Expenses recorded by this cashier for the current open shift.
  const shift = await CashShiftModel.findOne({
    cashierId: user.id,
    status: "OPEN",
  })
    .select("_id")
    .lean<{ _id: mongoose.Types.ObjectId }>();

  if (!shift) {
    return NextResponse.json({ success: true, data: [], summary: { total: 0 } });
  }

  const shiftId = shift._id.toString();
  const expenses = await ExpenseModel.find({
    isActive: true,
    $or: [
      { shiftId: shift._id },
      { remarks: { $regex: `SHIFT:${shiftId}` } },
    ],
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
  const { user, response } = await requireMobileAuth(req, [
    "expenses-bodega.manage",
    "sales.manage",
  ]);
  if (response) return response;

  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  await connectDb();

  let body: {
    name?: string;
    amount?: number;
    type?: string;
    expenseDate?: string;
    remarks?: string;
  };
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
  const notes = String(body?.remarks || "").trim();
  const expenseDateInput = String(body?.expenseDate || "").trim();
  const expenseDate = expenseDateInput
    ? new Date(`${expenseDateInput}T00:00:00.000Z`)
    : new Date();
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

  const mongoSession = await mongoose.startSession();
  try {
    let expenseId = "";

    await mongoSession.withTransaction(async () => {
      // Writing the shift inside the same transaction makes expense posting
      // conflict safely with OPEN -> CLOSING during drawer close.
      const shift = await CashShiftModel.findOneAndUpdate(
        {
          cashierId: user.id,
          outletId: user.outlet!.id,
          status: "OPEN",
        },
        { $inc: { cashExpenses: amount } },
        { new: true, session: mongoSession }
      );

      if (!shift) {
        throw new Error("NO_OPEN_SHIFT");
      }

      const shiftId = shift._id.toString();
      const [expense] = await ExpenseModel.create(
        [
          {
            name,
            expenseCategory: "OUTLET",
            type,
            expenseDate,
            amount,
            outletId: user.outlet!.id,
            shiftId,
            remarks: [
              `MOBILE EXPENSE OUTLET:${user.outlet!.id} SHIFT:${shiftId}`,
              notes,
            ]
              .filter(Boolean)
              .join(" | "),
            createdBy: user.id,
            isActive: true,
          },
        ],
        { session: mongoSession }
      );
      expenseId = expense._id.toString();
    });

    return NextResponse.json({
      success: true,
      message: "Expense recorded.",
      expense: { id: expenseId, name, amount },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_OPEN_SHIFT") {
      return NextResponse.json(
        {
          success: false,
          message: "Open a cash shift before recording expenses.",
        },
        { status: 409 }
      );
    }
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Unable to record the expense." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
  if (Number.isNaN(expenseDate.getTime())) {
    return NextResponse.json(
      { success: false, message: "Enter a valid expense date." },
      { status: 400 }
    );
  }
}
