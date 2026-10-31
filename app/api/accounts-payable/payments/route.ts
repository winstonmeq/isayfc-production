import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import SupplierPayment from "@/models/SupplierPayment";
import { supplierHistoryFilters } from "@/lib/supplier-history-filters";

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(["accounts-payable.view", "accounts-payable.manage"]); if (response) return response;
  let parsed;
  try { parsed = supplierHistoryFilters(req.nextUrl.searchParams, "paymentDate"); }
  catch (error) { return NextResponse.json({ success: false, message: (error as Error).message }, { status: 400 }); }
  await dbConnect();
  const { filter, page, limit } = parsed;
  const data = await SupplierPayment.find(filter).populate("supplierId", "name").populate("supplierInvoiceId", "invoiceNumber").sort({ paymentDate: -1, _id: -1 }).lean();
  return NextResponse.json({ success: true, data: data.slice((page - 1) * limit, page * limit), summary: { paid: data.reduce((sum, row) => sum + Number(row.amount || 0), 0) }, meta: { page, total: data.length, totalPages: Math.max(1, Math.ceil(data.length / limit)) } });
}
