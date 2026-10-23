import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanString } from "@/lib/crud-utils";
import ExpenseTypeModel from "@/models/ExpenseType";

async function handlePATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission("expenses-bodega.manage");
  if (response) return response;
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ success: false, message: "Invalid expense type ID." }, { status: 400 });
  }

  const body = await req.json();
  const name = cleanString(body.name);
  const description = cleanString(body.description);
  if (!name) {
    return NextResponse.json({ success: false, message: "Expense type name is required." }, { status: 400 });
  }

  await dbConnect();
  const item = await ExpenseTypeModel.findByIdAndUpdate(id, { name, description }, { new: true }).lean();
  if (!item) {
    return NextResponse.json({ success: false, message: "Expense type not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true, message: "Expense type updated successfully." });
}

async function handleDELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission("expenses-bodega.manage");
  if (response) return response;
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ success: false, message: "Invalid expense type ID." }, { status: 400 });
  }

  await dbConnect();
  const item = await ExpenseTypeModel.findOneAndUpdate(
    { _id: id, isActive: true },
    { isActive: false },
    { new: true }
  );
  if (!item) {
    return NextResponse.json({ success: false, message: "Expense type not found." }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    message: "Expense type removed from future entries. Existing records were preserved.",
  });
}

export const PATCH = withAuditLog(handlePATCH, {
  module: "EXPENSES", action: "UPDATE", entityType: "EXPENSE_TYPE",
});
export const DELETE = withAuditLog(handleDELETE, {
  module: "EXPENSES", action: "DELETE", entityType: "EXPENSE_TYPE",
});
