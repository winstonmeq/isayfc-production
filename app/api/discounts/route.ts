import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { validateDiscountRule, type DiscountRule } from "@/lib/discounts";
import DiscountModel from "@/models/Discount";

export async function GET(req: NextRequest) {
  const inactive = req.nextUrl.searchParams.get("includeInactive") === "true";
  const { response } = await requirePermission(inactive ? "discounts.manage" : ["discounts.view", "discounts.manage", "sales.manage"]);
  if (response) return response;
  await dbConnect();
  const data = await DiscountModel.find(inactive ? {} : { isActive: true }).sort({ name: 1 }).lean();
  return NextResponse.json({ success: true, data: data.map((item) => ({ ...item, basis: item.basis || "PER_ROW", _id: String(item._id) })) });
}

async function handlePOST(req: NextRequest) {
  const { response } = await requirePermission("discounts.manage");
  if (response) return response;
  const body = await req.json().catch(() => null);
  const rule = { name: String(body?.name || "").trim(), type: body?.type, value: Number(body?.value), basis: body?.basis ?? "PER_UNIT" } as DiscountRule;
  try { validateDiscountRule(rule); } catch (error) {
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 400 });
  }
  await dbConnect();
  const item = await DiscountModel.create(rule);
  return NextResponse.json({ success: true, message: "Discount created.", data: item }, { status: 201 });
}
export const POST = withAuditLog(handlePOST, { module: "DISCOUNTS", action: "CREATE", entityType: "DISCOUNT" });
