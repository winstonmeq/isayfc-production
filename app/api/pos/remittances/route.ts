import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { outletExpenseDay } from "@/lib/business-flow";
import { moneyAmount } from "@/lib/employee-finance";
import { withAuditLog } from "@/lib/audit-log";
import User from "@/models/User";
import Outlet from "@/models/Outlet";
import Remittance from "@/models/OutletRemittance";

export async function GET(req: NextRequest) {
  const { session, response } = await requirePermission(["pos.view", "payments.view"]); if (response) return response;
  await dbConnect();
  const user = await User.findById(session!.user.id).select("role outletId").lean();
  if (!user) return NextResponse.json({ message: "User not found." }, { status: 403 });
  const admin = String(user.role).toUpperCase() === "ADMIN";
  const outlets = await Outlet.find({ isActive: true, ...(admin ? {} : { _id: { $in: user.outletId ? [user.outletId] : [] } }) }).select("name code").sort({ name: 1 }).lean();
  const filter: Record<string, unknown> = { outletId: { $in: outlets.map(row => row._id) } };
  const outletId = req.nextUrl.searchParams.get("outletId");
  if (outletId && outlets.some(outlet => String(outlet._id) === outletId)) filter.outletId = outletId;
  const rows = await Remittance.find(filter).populate("outletId", "name code").populate("createdBy", "name").sort({ businessDate: -1, createdAt: -1 }).limit(500).lean();
  return NextResponse.json({ success: true, outlets: outlets.map(row => ({ id: String(row._id), name: row.name })), data: rows });
}
async function handlePOST(req: NextRequest) {
  const { session, response } = await requirePermission("pos.manage"); if (response) return response;
  const body = await req.json();
  await dbConnect();
  try {
    const outletId = String(body.outletId || "");
    if (!isValidObjectId(outletId) || !await findAuthorizedPosOutlet(session!.user.id, outletId)) throw new Error("Select an authorized outlet.");
    const date = outletExpenseDay(body.date), amount = moneyAmount(body.amount);
    const reference = String(body.reference || "").trim().slice(0, 150);
    const requestKey = String(body.requestKey || "");
    if (!date || !reference || !requestKey || requestKey.length > 100) throw new Error("Business date, cash-transfer reference and request key are required.");
    const values = { outletId, businessDate: date, amount, reference, remarks: String(body.remarks || "").slice(0, 500) };
    const requestHash = createHash("sha256").update(JSON.stringify(values)).digest("hex");
    const existing = await Remittance.findOne({ outletId, requestKey });
    if (existing && existing.requestHash !== requestHash) throw new Error("This request was already used for different remittance details.");
    if (!existing) await Remittance.create({ ...values, requestKey, requestHash, createdBy: session!.user.id });
    return NextResponse.json({ success: true, message: "Outlet remittance recorded as an internal cash transfer. No sales, expenses or customer payments were created." });
  } catch (error) { return NextResponse.json({ success: false, message: (error as Error).message }, { status: 400 }); }
}
export const POST = withAuditLog(handlePOST, { module: "OUTLET", action: "RECORD_REMITTANCE", entityType: "OUTLET_REMITTANCE" });
