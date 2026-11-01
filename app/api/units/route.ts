import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import Unit from "@/models/ProductUnit";
import { ensureProductUnits } from "@/lib/product-units";
import { normalizeUnitCode } from "@/lib/product-unit-policy";
import { withAuditLog } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(["products.view", "products.manage", "bodega-products.view", "bodega-products.manage", "sales.manage", "purchase-items.manage"]);
  if (response) return response;
  await dbConnect(); await ensureProductUnits();
  const data = await Unit.find(req.nextUrl.searchParams.get("includeInactive") === "true" ? {} : { isActive: true }).sort({ code: 1 }).lean();
  return NextResponse.json({ success: true, data: data.map((unit) => ({ ...unit, _id: String(unit._id) })) });
}
async function create(req: NextRequest) {
  const { response } = await requirePermission("products.manage"); if (response) return response;
  const body = await req.json().catch(() => null);
  const code = normalizeUnitCode(body?.code), name = String(body?.name || "").trim();
  if (!/^[A-Z][A-Z0-9_]{0,11}$/.test(code) || !name || name.length > 80 || typeof body?.allowsDecimal !== "boolean") return NextResponse.json({ success: false, message: "Enter a unit code, name (up to 80 characters), and quantity rule." }, { status: 400 });
  await dbConnect(); await ensureProductUnits();
  try { const unit = await Unit.create({ code, name, allowsDecimal: body.allowsDecimal }); return NextResponse.json({ success: true, data: unit }, { status: 201 }); }
  catch (error) { if ((error as { code?: number }).code === 11000) return NextResponse.json({ success: false, message: "This unit code already exists." }, { status: 409 }); throw error; }
}
export const POST = withAuditLog(create, { module: "PRODUCTS", action: "CREATE_UNIT", entityType: "PRODUCT_UNIT" });
