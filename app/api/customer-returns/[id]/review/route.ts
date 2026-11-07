import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import Return from "@/models/MainCustomerReturn";
import Sale from "@/models/Sale";
import SaleLine from "@/models/SaleLine";
import Customer from "@/models/Customer";
import AuditLog from "@/models/AuditLog";
import { returnSettlement } from "@/lib/main-return-settlement";

type Context = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, context: Context) {
  const { response, session: auth } = await requirePermission(["inventory-adjustments.view", "inventory-adjustments.manage"]);
  if (response) return response;
  const { id } = await context.params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid return." }, { status: 400 });
  await dbConnect();
  const row = await Return.findById(id).populate("reviewedBy", "name").lean();
  if (!row) return NextResponse.json({ success: false, message: "Return not found." }, { status: 404 });
  const sale = await Sale.findById(row.saleId).select("receiptNumber saleDate totalAmount paidAmount balance returnedAmount refundedAmount status isVoided").lean();
  const line = await SaleLine.findById(row.saleLineId).select("productName qty lineTotal stockUnit unitCost baseQty").lean();
  const customer = await Customer.findById(row.customerId).select("name").lean();
  const canReview = auth!.user.role === "ADMIN" || auth!.user.roleName === "ADMIN" || auth!.user.permissions?.includes("inventory-adjustments.manage");
  const canPost = canReview && (auth!.user.role === "ADMIN" || auth!.user.roleName === "ADMIN" || auth!.user.permissions?.includes("payments.manage"));
  let postingAmount = Number(row.creditAmount || 0);
  if (line && row.status === "APPROVED_AWAITING_POSTING") {
    const prior = await Return.find({ saleLineId: row.saleLineId, status: "POSTED" }).lean();
    const priorQuantity = prior.reduce((n, r) => n + Number(r.quantity), 0);
    postingAmount = Math.round((Math.abs(priorQuantity + row.quantity - line.qty) < 0.000001 ? line.lineTotal - prior.reduce((n, r) => n + Number(r.creditAmount), 0) : line.lineTotal * row.quantity / line.qty) * 100) / 100;
  }
  let settlement;
  try { settlement = sale && ["PENDING_REVIEW", "APPROVED_AWAITING_POSTING"].includes(row.status) ? returnSettlement(sale, postingAmount) : { credit: row.balanceCredit || 0, refund: row.cashRefund || 0, balance: sale?.balance || 0 }; }
  catch { return NextResponse.json({ success: false, message: "Original sale balance changed. This return needs correction before posting." }, { status: 409 }); }
  return NextResponse.json({ success: true, canReview: Boolean(canReview), canPost: Boolean(canPost), settlement, row, sale, line, customer: customer?.name || "Unknown customer" });
}
export async function POST(req: NextRequest, context: Context) {
  const { response, session: auth } = await requirePermission("inventory-adjustments.manage");
  if (response) return response;
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const reason = String(body?.reason || "").trim();
  if (!mongoose.isValidObjectId(id) || !["APPROVE", "REJECT"].includes(body?.decision) || reason.length < 5 || reason.length > 1000 || !body?.expectedUpdatedAt || Number.isNaN(new Date(body.expectedUpdatedAt).getTime())) return NextResponse.json({ success: false, message: "Select a decision and enter a review reason (5–1000 characters)." }, { status: 400 });
  await dbConnect();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const original = await Return.findOne({ _id: id, status: "PENDING_REVIEW", updatedAt: new Date(body.expectedUpdatedAt) }).session(session);
      if (!original) throw new Error("Return was already reviewed or changed. Refresh the list.");
      if (body.decision === "APPROVE") {
        const sale = await Sale.exists({ _id: original.saleId, isVoided: false, ownerOutletId: null, fulfillmentStatus: { $ne: "PENDING" } }).session(session);
        const line = await SaleLine.exists({ _id: original.saleLineId, saleId: original.saleId, qty: { $gte: original.quantity } }).session(session);
        if (!sale || !line) throw new Error("Original sale is unavailable or changed. Correct it before approving the return.");
      }
      const status = body.decision === "APPROVE" ? "APPROVED_AWAITING_POSTING" : "REJECTED";
      const updated = await Return.findOneAndUpdate({ _id: id, status: "PENDING_REVIEW", updatedAt: original.updatedAt }, { $set: { status, reviewedAt: new Date(), reviewedBy: auth!.user.id, reviewReason: reason } }, { new: true, session });
      if (!updated) throw new Error("Another reviewer already processed this return.");
      await AuditLog.create([{ module: "MAIN CUSTOMER RETURNS", action: "UPDATE", entityType: "CUSTOMER_RETURN", entityId: original._id, oldValue: { status: original.status }, newValue: { status, reviewedBy: auth!.user.id }, remarks: reason, sourceChannel: "WEB", createdBy: auth!.user.id }], { session });
    });
    return NextResponse.json({ success: true, message: body.decision === "APPROVE" ? "Return approved for processing. Stock, customer credit and refund have NOT been posted; status is Awaiting Posting." : "Return rejected. No stock or payment changes were made." });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to review return." }, { status: 409 }); }
  finally { await session.endSession(); }
}
