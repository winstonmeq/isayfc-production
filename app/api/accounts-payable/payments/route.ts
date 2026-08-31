import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import SupplierPayment from "@/models/SupplierPayment";

export async function GET() {
  const { response } = await requirePermission(["accounts-payable.view", "accounts-payable.manage"]); if (response) return response;
  await dbConnect(); const data = await SupplierPayment.find().populate("supplierId", "name").populate("supplierInvoiceId", "invoiceNumber").sort({ paymentDate: -1 }).limit(1000).lean();
  return NextResponse.json({ success: true, data });
}
