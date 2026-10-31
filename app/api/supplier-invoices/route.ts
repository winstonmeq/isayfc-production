import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import Supplier from "@/models/Supplier";
import SupplierInvoice from "@/models/SupplierInvoice";
import { supplierHistoryFilters } from "@/lib/supplier-history-filters";

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(["supplier-invoices.view", "supplier-invoices.manage", "accounts-payable.view", "accounts-payable.manage"]); if (response) return response;
  await dbConnect(); const params = new URL(req.url).searchParams; const status = params.get("status");
  const filter: any = status && status !== "ALL" ? { status } : { status: { $ne: "VOID" } };
  let parsed;
  try { parsed = supplierHistoryFilters(params, "invoiceDate"); }
  catch (error) { return NextResponse.json({ success: false, message: (error as Error).message }, { status: 400 }); }
  Object.assign(filter, parsed.filter);
  const data = await SupplierInvoice.find(filter).populate("supplierId", "name").sort({ dueDate: 1, invoiceDate: -1 }).lean();
  const totals = data.reduce((a: any, x: any) => ({ invoiced: a.invoiced + Number(x.amount), paid: a.paid + Number(x.paidAmount), balance: a.balance + Number(x.balance) }), { invoiced: 0, paid: 0, balance: 0 });
  const { page, limit } = parsed;
  return NextResponse.json({ success: true, data: params.has("page") ? data.slice((page - 1) * limit, page * limit) : data, summary: totals, meta: { page, total: data.length, totalPages: Math.max(1, Math.ceil(data.length / limit)) } });
}
async function handlePOST(req: NextRequest) {
  const { response, session } = await requirePermission("supplier-invoices.manage"); if (response) return response;
  await dbConnect(); const b = await req.json(); const amount = Number(b.amount);
  if (!isValidObjectId(b.supplierId) || !b.invoiceNumber || !b.invoiceDate || !b.dueDate || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({ success: false, message: "Supplier, invoice number, dates, and amount are required." }, { status: 400 });
  if (!await Supplier.exists({ _id: b.supplierId, isActive: true })) return NextResponse.json({ success: false, message: "Supplier not found." }, { status: 404 });
  try { const doc = await SupplierInvoice.create({ supplierId: b.supplierId, invoiceNumber: b.invoiceNumber, invoiceDate: new Date(b.invoiceDate), dueDate: new Date(b.dueDate), amount, balance: amount, remarks: b.remarks, createdBy: session?.user?.id }); return NextResponse.json({ success: true, message: "Supplier invoice recorded.", data: doc }, { status: 201 }); }
  catch (e: any) { if (e?.code === 11000) return NextResponse.json({ success: false, message: "This supplier invoice number already exists." }, { status: 409 }); throw e; }
}
export const POST = withAuditLog(handlePOST, { module: "PURCHASING", action: "CREATE_SUPPLIER_INVOICE", entityType: "SUPPLIER_INVOICE" });
