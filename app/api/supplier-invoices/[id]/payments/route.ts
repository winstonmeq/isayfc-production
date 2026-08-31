import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import SupplierInvoice from "@/models/SupplierInvoice";
import SupplierPayment from "@/models/SupplierPayment";

async function handlePOST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { response, session } = await requirePermission("accounts-payable.manage"); if (response) return response;
  const { id } = await ctx.params; if (!isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid invoice ID." }, { status: 400 });
  await dbConnect(); const b = await req.json(); const amount = Number(b.amount); if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ success: false, message: "Payment must be greater than zero." }, { status: 400 });
  const mongoSession = await mongoose.startSession();
  try { await mongoSession.withTransaction(async () => {
    const invoice: any = await SupplierInvoice.findById(id).session(mongoSession);
    if (!invoice || invoice.status === "VOID") throw new Error("Supplier invoice not found.");
    if (amount > Number(invoice.balance) + 0.0001) throw new Error("Payment cannot exceed the invoice balance.");
    await SupplierPayment.create([{ supplierInvoiceId: invoice._id, supplierId: invoice.supplierId, paymentDate: b.paymentDate ? new Date(b.paymentDate) : new Date(), amount, paymentMethod: b.paymentMethod || "CASH", referenceNumber: b.referenceNumber, remarks: b.remarks, createdBy: session?.user?.id }], { session: mongoSession });
    invoice.paidAmount = Number(invoice.paidAmount) + amount; invoice.balance = Math.max(0, Number(invoice.amount) - invoice.paidAmount); invoice.status = invoice.balance <= 0.0001 ? "PAID" : "PARTIAL"; await invoice.save({ session: mongoSession });
  }); } finally { await mongoSession.endSession(); }
  return NextResponse.json({ success: true, message: "Supplier payment recorded." });
}
export const POST = withAuditLog(handlePOST, { module: "FINANCE", action: "PAY_SUPPLIER_INVOICE", entityType: "SUPPLIER_PAYMENT" });
