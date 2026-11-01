import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString } from "@/lib/crud-utils";
import ExpenseModel, { ExpenseCategory, ExpenseType } from "@/models/Expense";
import ExpenseTypeModel from "@/models/ExpenseType";
import { ensureDefaultExpenseTypes, expenseTypeCode } from "@/lib/expense-types";
import { parseExpenseDate } from "@/lib/expense-date";
import { isMainExpenseCategory } from "@/lib/expense-scope";

const expenseCategories: ExpenseCategory[] = ["GROCERY", "BODEGA", "OUTLET"];

function isExpenseCategory(value: string): value is ExpenseCategory {
  return expenseCategories.includes(value as ExpenseCategory);
}

function normalizeExpenseCategory(value: unknown): ExpenseCategory {
  const raw = cleanString(value).toUpperCase();
  return isExpenseCategory(raw) ? raw : "BODEGA";
}

function normalizeExpenseType(value: unknown): ExpenseType {
  return expenseTypeCode(value) || "OTHERS";
}

function serializeExpense(expense: any) {
  return {
    _id: expense._id.toString(),
    isAutomatic: expense.origin === "OWNER_OUTLET_DELIVERY",
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
  if (await ExpenseModel.exists({ _id: id, origin: "OWNER_OUTLET_DELIVERY" })) {
    return NextResponse.json({ success: false, message: "Automatic delivery expenses cannot be edited or deleted. Review the linked delivery and sale." }, { status: 409 });
  }
  await ensureDefaultExpenseTypes();

  const body = await req.json();
  if (!isMainExpenseCategory(body.expenseCategory)) {
    return NextResponse.json(
      { success: false, message: "Outlet expenses must be managed from the outlet POS." },
      { status: 400 }
    );
  }
  const name = cleanString(body.name);
  const expenseCategory = normalizeExpenseCategory(body.expenseCategory);
  const type = normalizeExpenseType(body.type);
  const expenseDateInput = cleanString(body.expenseDate);
  const amount = cleanNumber(body.amount);
  const remarks = cleanString(body.remarks);

  const validType = await ExpenseTypeModel.exists({ code: type, isActive: true });
  if (!validType) {
    return NextResponse.json(
      { success: false, message: "Select a valid active expense type." },
      { status: 400 }
    );
  }

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

  const expenseDate = parseExpenseDate(expenseDateInput);

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
    { _id: id, origin: { $ne: "OWNER_OUTLET_DELIVERY" }, isActive: true, outletId: null, expenseCategory: { $ne: "OUTLET" } },
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

  if (await ExpenseModel.exists({ _id: id, origin: "OWNER_OUTLET_DELIVERY" })) {
    return NextResponse.json({ success: false, message: "Automatic delivery expenses cannot be edited or deleted. Review the linked delivery and sale." }, { status: 409 });
  }

  const expense = await ExpenseModel.findOneAndUpdate(
    { _id: id, origin: { $ne: "OWNER_OUTLET_DELIVERY" }, isActive: true, outletId: null, expenseCategory: { $ne: "OUTLET" } },
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
