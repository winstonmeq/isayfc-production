import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanString } from "@/lib/crud-utils";
import { ensureDefaultExpenseTypes, expenseTypeCode } from "@/lib/expense-types";
import ExpenseTypeModel from "@/models/ExpenseType";

function serialize(item: any) {
  return {
    _id: item._id.toString(),
    code: item.code,
    name: item.name,
    description: item.description || "",
    isSystem: Boolean(item.isSystem),
    isActive: item.isActive !== false,
  };
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission([
    "expenses-bodega.view",
    "expenses-bodega.manage",
  ]);
  if (response) return response;

  await dbConnect();
  await ensureDefaultExpenseTypes();
  const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "true";
  const items = await ExpenseTypeModel.find(includeInactive ? {} : { isActive: true })
    .sort({ isActive: -1, name: 1 })
    .lean();

  return NextResponse.json({ success: true, data: items.map(serialize) });
}

async function handlePOST(req: NextRequest) {
  const { response } = await requirePermission("expenses-bodega.manage");
  if (response) return response;

  await dbConnect();
  const body = await req.json();
  const name = cleanString(body.name);
  const code = expenseTypeCode(body.code || name);
  const description = cleanString(body.description);

  if (!name || !code) {
    return NextResponse.json(
      { success: false, message: "Expense type name is required." },
      { status: 400 }
    );
  }

  const existing = await ExpenseTypeModel.findOne({ code });
  if (existing) {
    if (!existing.isActive) {
      existing.name = name;
      existing.description = description;
      existing.isActive = true;
      await existing.save();
      return NextResponse.json({
        success: true,
        message: "Expense type restored successfully.",
        data: serialize(existing.toObject()),
      });
    }
    return NextResponse.json(
      { success: false, message: "An expense type with this code already exists." },
      { status: 409 }
    );
  }

  const item = await ExpenseTypeModel.create({ code, name, description });
  return NextResponse.json(
    { success: true, message: "Expense type created successfully.", data: serialize(item.toObject()) },
    { status: 201 }
  );
}

export const POST = withAuditLog(handlePOST, {
  module: "EXPENSES",
  action: "CREATE",
  entityType: "EXPENSE_TYPE",
});
