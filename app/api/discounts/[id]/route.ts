import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { validateDiscountRule, type DiscountRule } from "@/lib/discounts";
import DiscountModel from "@/models/Discount";

async function handlePATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission("discounts.manage");
  if (response) return response;
  const { id } = await context.params;
  if (!isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid discount." }, { status: 400 });
  const body = await req.json().catch(() => null);
  const rule = { name: String(body?.name || "").trim(), type: body?.type, value: Number(body?.value), ...(body?.basis !== undefined ? { basis: body.basis } : {}) } as DiscountRule;
  try { validateDiscountRule(rule); } catch (error) {
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 400 });
  }
  await dbConnect();
  const item = await DiscountModel.findByIdAndUpdate(id, { ...rule, ...(typeof body?.isActive === "boolean" ? { isActive: body.isActive } : {}) }, { new: true, runValidators: true });
  if (!item) return NextResponse.json({ success: false, message: "Discount not found." }, { status: 404 });
  return NextResponse.json({ success: true, message: "Discount updated.", data: item });
}
async function handleDELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { response } = await requirePermission("discounts.manage");
  if (response) return response;
  const { id } = await context.params;
  if (!isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid discount." }, { status: 400 });
  await dbConnect();
  const item = await DiscountModel.findByIdAndUpdate(id, { isActive: false });
  if (!item) return NextResponse.json({ success: false, message: "Discount not found." }, { status: 404 });
  return NextResponse.json({ success: true, message: "Discount disabled. Past sales retain their original discount." });
}
export const PATCH = withAuditLog(handlePATCH, { module: "DISCOUNTS", action: "UPDATE", entityType: "DISCOUNT" });
export const DELETE = withAuditLog(handleDELETE, { module: "DISCOUNTS", action: "DELETE", entityType: "DISCOUNT" });
