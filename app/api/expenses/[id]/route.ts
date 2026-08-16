import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString } from "@/lib/crud-utils";
import ExpenseModel, { ExpenseCategory, ExpenseType } from "@/models/Expense";

const expenseCategories: ExpenseCategory[] = ["GROCERY", "BODEGA", "OUTLET"];

const expenseTypes: ExpenseType[] = [
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

function isExpenseCategory(value: string): value is ExpenseCategory {
  return expenseCategories.includes(value as ExpenseCategory);
}

function isExpenseType(value: string): value is ExpenseType {
  return expenseTypes.includes(value as ExpenseType);
}

function normalizeExpenseCategory(value: unknown): ExpenseCategory {
  const raw = cleanString(value).toUpperCase();
  return isExpenseCategory(raw) ? raw : "BODEGA";
}

function normalizeExpenseType(value: unknown): ExpenseType {
  const raw = cleanString(value).toUpperCase();
  return isExpenseType(raw) ? raw : "OTHERS";
}

function toExpenseDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeExpense(expense: any) {
  return {
    _id: expense._id.toString(),
    name: expense.name,
    expenseCategory: expense.outletId
      ? "OUTLET"
      : normalizeExpenseCategory(expense.expenseCategory),
    type: normalizeExpenseType(expense.type),
    expenseDate: expense.expenseDate
      ? new Date(expense.expenseDate).toISOString()
      : undefined,
    amount: Number(expense.amount || 0),
    remarks: expense.remarks || "",
    createdAt: expense.createdAt
      ? new Date(expense.createdAt).toISOString()
      : undefined,
    updatedAt: expense.updatedAt
      ? new Date(expense.updatedAt).toISOString()
      : undefined,
  };
}

async function handlePATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("expenses-bodega.manage");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid expense ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const body = await req.json();
  const name = cleanString(body.name);
  const expenseCategory = normalizeExpenseCategory(body.expenseCategory);
  const type = normalizeExpenseType(body.type);
  const expenseDateInput = cleanString(body.expenseDate);
  const amount = cleanNumber(body.amount);
  const remarks = cleanString(body.remarks);

  if (!name) {
    return NextResponse.json(
      { success: false, message: "Expense name is required." },
      { status: 400 }
    );
  }

  if (!expenseDateInput) {
    return NextResponse.json(
      { success: false, message: "Expense date is required." },
      { status: 400 }
    );
  }

  const expenseDate = toExpenseDate(expenseDateInput);

  if (!expenseDate) {
    return NextResponse.json(
      { success: false, message: "Expense date is invalid." },
      { status: 400 }
    );
  }

  if (amount <= 0) {
    return NextResponse.json(
      { success: false, message: "Amount must be greater than zero." },
      { status: 400 }
    );
  }

  const expense = await ExpenseModel.findOneAndUpdate(
    { _id: id, isActive: true },
    {
      name,
      expenseCategory,
      type,
      expenseDate,
      amount,
      remarks,
    },
    { new: true }
  );

  if (!expense) {
    return NextResponse.json(
      { success: false, message: "Expense not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Expense updated successfully.",
    data: serializeExpense(expense.toObject()),
  });
}

async function handleDELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("expenses-bodega.manage");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid expense ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const expense = await ExpenseModel.findOneAndUpdate(
    { _id: id, isActive: true },
    { isActive: false },
    { new: true }
  );

  if (!expense) {
    return NextResponse.json(
      { success: false, message: "Expense not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Expense deleted successfully.",
  });
}

export const PATCH = withAuditLog(handlePATCH, {
  module: "EXPENSES",
  action: "UPDATE",
  entityType: "EXPENSE",
});

export const DELETE = withAuditLog(handleDELETE, {
  module: "EXPENSES",
  action: "DELETE",
  entityType: "EXPENSE",
});
