import { NextRequest, NextResponse } from "next/server";
import { expenseBusinessCategory } from "@/lib/transaction-category";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import {
  cleanNumber,
  cleanString,
  escapeRegex,
  getPagination,
} from "@/lib/crud-utils";
import ExpenseModel, { ExpenseCategory, ExpenseType } from "@/models/Expense";
import ExpenseTypeModel from "@/models/ExpenseType";
import { ensureDefaultExpenseTypes, expenseTypeCode } from "@/lib/expense-types";
import { isMainExpenseCategory } from "@/lib/expense-scope";
import { parseExpenseDate } from "@/lib/expense-date";
import { excludeLegacyDeliveryExpenses } from "@/lib/main-expense-policy";

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

function categoryFilter(category: ExpenseCategory) {
  if (category === "OUTLET") {
    return { outletId: { $exists: true, $ne: null } };
  }

  if (category === "BODEGA") {
    return {
      $and: [
        { outletId: null },
        {
          $or: [
            { expenseCategory: "BODEGA" },
            { expenseCategory: { $exists: false } },
            { expenseCategory: null },
            { expenseCategory: "" },
          ],
        },
      ],
    };
  }

  return { expenseCategory: category };
}

function serializeExpense(expense: any) {
  const effectiveCategory: ExpenseCategory = expense.outletId
    ? "OUTLET"
    : normalizeExpenseCategory(expense.expenseCategory);
  return {
    _id: expense._id.toString(),
    isAutomatic: expense.origin === "OWNER_OUTLET_DELIVERY",
    businessCategory: expenseBusinessCategory(expense),
    name: expense.name,
    expenseCategory: effectiveCategory,
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

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("expenses-bodega.view");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const search = cleanString(searchParams.get("search"));
  const expenseCategory = cleanString(searchParams.get("expenseCategory")).toUpperCase();
  const type = cleanString(searchParams.get("type")).toUpperCase();
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));

  const andFilters: Record<string, any>[] = [
    { isActive: true },
    excludeLegacyDeliveryExpenses(),
    { outletId: null },
    { expenseCategory: { $ne: "OUTLET" } },
  ];

  if (search) {
    andFilters.push({
      $or: [
        { name: { $regex: escapeRegex(search), $options: "i" } },
        { remarks: { $regex: escapeRegex(search), $options: "i" } },
      ],
    });
  }

  if (isMainExpenseCategory(expenseCategory)) {
    andFilters.push(categoryFilter(expenseCategory));
  }

  if (type) {
    andFilters.push({ type });
  }

  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};

    if (dateFrom) {
      dateFilter.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }

    if (dateTo) {
      dateFilter.$lte = new Date(`${dateTo}T23:59:59.999Z`);
    }

    andFilters.push({ expenseDate: dateFilter });
  }

  const filter: Record<string, any> =
    andFilters.length === 1 ? andFilters[0] : { $and: andFilters };

  const normalizedCategoryExpression = {
    $cond: [
      { $ne: [{ $ifNull: ["$outletId", null] }, null] },
      "OUTLET",
      {
        $cond: [
          { $eq: ["$expenseCategory", "GROCERY"] },
          "GROCERY",
          "BODEGA",
        ],
      },
    ],
  };

  const [items, total, summary, categorySummary, typeSummary] = await Promise.all([
    ExpenseModel.find(filter)
      .sort({ expenseDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ExpenseModel.countDocuments(filter),
    ExpenseModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          rows: { $sum: 1 },
        },
      },
    ]),
    ExpenseModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: normalizedCategoryExpression,
          totalAmount: { $sum: "$amount" },
          rows: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    ExpenseModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$type",
          totalAmount: { $sum: "$amount" },
          rows: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map(serializeExpense),
    summary: {
      rows: summary[0]?.rows || 0,
      totalAmount: summary[0]?.totalAmount || 0,
      byCategory: categorySummary.map((item) => ({
        expenseCategory: normalizeExpenseCategory(item._id),
        rows: item.rows || 0,
        totalAmount: item.totalAmount || 0,
      })),
      byType: typeSummary.map((item) => ({
        type: normalizeExpenseType(item._id),
        rows: item.rows || 0,
        totalAmount: item.totalAmount || 0,
      })),
    },
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

async function handlePOST(req: NextRequest) {
  const { response, session } = await requirePermission("expenses-bodega.manage");
  if (response) return response;

  await dbConnect();
  await ensureDefaultExpenseTypes();

  const body = await req.json();
  if (!isMainExpenseCategory(body.expenseCategory)) {
    return NextResponse.json(
      { success: false, message: "Outlet expenses must be recorded from the outlet POS." },
      { status: 400 }
    );
  }
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

  const validType = type !== "OWNER_OUTLET_DELIVERY" && await ExpenseTypeModel.exists({ code: type, isActive: true });
  if (!validType) {
    return NextResponse.json(
      { success: false, message: "Select a valid active expense type." },
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

  const expense = await ExpenseModel.create({
    name,
    expenseCategory,
    type,
    expenseDate,
    amount,
    remarks,
    createdBy: session?.user?.id,
  });

  return NextResponse.json(
    {
      success: true,
      message: "Expense saved successfully.",
      data: serializeExpense(expense.toObject()),
    },
    { status: 201 }
  );
}

export const POST = withAuditLog(handlePOST, {
  module: "EXPENSES",
  action: "CREATE",
  entityType: "EXPENSE",
});
