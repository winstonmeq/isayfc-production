import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import Unit from "@/models/ProductUnit";
import { unitInUse } from "@/lib/product-units";
import { withAuditLog } from "@/lib/audit-log";
type Context = { params: Promise<{ id: string }> };
async function change(req: NextRequest, context: Context) {
  const { response } = await requirePermission("products.manage"); if (response) return response;
  const { id } = await context.params;
  if (!isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid unit." }, { status: 400 });
  await dbConnect(); const unit = await Unit.findById(id);
  if (!unit) return NextResponse.json({ success: false, message: "Unit not found." }, { status: 404 });
  const body = req.method === "DELETE" ? { isActive: false } : await req.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, message: "Invalid unit details." }, { status: 400 });
  if (body.code !== undefined && body.code !== unit.code) return NextResponse.json({ success: false, message: "Unit codes cannot be changed. Create a new unit instead." }, { status: 409 });
  const semanticChange = body.allowsDecimal !== undefined && body.allowsDecimal !== unit.allowsDecimal;
  if ((body.isActive === false || semanticChange) && (unit.isSystem || await unitInUse(unit.code))) return NextResponse.json({ success: false, message: "A standard or assigned unit cannot be removed or have its quantity rule changed." }, { status: 409 });
  if (body.name !== undefined) { const name = String(body.name).trim(); if (!name || name.length > 80) return NextResponse.json({ success: false, message: "Enter a valid unit name." }, { status: 400 }); unit.name = name; }
  if (body.allowsDecimal !== undefined) { if (typeof body.allowsDecimal !== "boolean") return NextResponse.json({ success: false, message: "Invalid quantity rule." }, { status: 400 }); unit.allowsDecimal = body.allowsDecimal; }
  if (body.isActive !== undefined) { if (typeof body.isActive !== "boolean") return NextResponse.json({ success: false, message: "Invalid unit status." }, { status: 400 }); unit.isActive = body.isActive; }
  await unit.save(); return NextResponse.json({ success: true, data: unit });
}
export const PATCH = withAuditLog(change, { module: "PRODUCTS", action: "UPDATE_UNIT", entityType: "PRODUCT_UNIT" });
export const DELETE = withAuditLog(change, { module: "PRODUCTS", action: "DEACTIVATE_UNIT", entityType: "PRODUCT_UNIT" });
