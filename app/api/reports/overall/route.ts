import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { parseReportRange } from "@/lib/report-utils";
import { manilaDateString } from "@/lib/date-utils";
import { getOwnerOutletAllocations } from "@/lib/owner-outlet-allocations";
import { buildOverallBusinessReport, overallSalesFilter } from "@/lib/overall-business-report";
import { getSaleOrigin } from "@/lib/sale-origin";
import { getExpenseTypeNames } from "@/lib/expense-types";
import Sale from "@/models/Sale";
import SaleLine from "@/models/SaleLine";
import Expense from "@/models/Expense";
import Outlet from "@/models/Outlet";
import Customer from "@/models/Customer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("reports.overall");
  if (response) return response;
  const { start, end } = parseReportRange(req.nextUrl.searchParams);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return NextResponse.json({ success: false, message: "Select a valid date range." }, { status: 400 });
  await dbConnect(); void Customer;
  const [sales, expenses, outlets, allocations, expenseNames] = await Promise.all([
    Sale.find(overallSalesFilter(start, end)).populate("customerId", "name")
      .select("source channel receiptNumber remarks transactionType ownerOutletId saleDate recognizedAt customerId outletId totalAmount subtotal discountAmount")
      .sort({ saleDate: 1, _id: 1 }).lean(),
    Expense.find({ isActive: true, expenseDate: { $gte: start, $lt: end } }).select("name type amount origin expenseDate expenseCategory outletId remarks").sort({ expenseDate: 1, _id: 1 }).lean(),
    Outlet.find({}).select("name code").sort({ name: 1 }).lean(),
    getOwnerOutletAllocations(start, end), getExpenseTypeNames(),
  ]);
  const lines = sales.length ? await SaleLine.find({ saleId: { $in: sales.map((sale) => sale._id) } })
    .select("saleId productName qty baseQty stockPcsOut unitCost companyUnitCost").lean() : [];
  const report = buildOverallBusinessReport(sales.map((sale) => ({ ...sale, id: String(sale._id), outletId: sale.outletId ? String(sale.outletId) : undefined,
    ownerOutletId: sale.ownerOutletId ? String(sale.ownerOutletId) : undefined,
    date: new Date(getSaleOrigin(sale) === "OUTLET" ? sale.saleDate : sale.recognizedAt || sale.saleDate).toISOString(),
    customer: (sale.customerId as unknown as { name?: string } | null)?.name || "Walk-in" })),
    lines.map((line) => ({ ...line, saleId: String(line.saleId) })),
    expenses.map((expense) => ({ id: String(expense._id), date: new Date(expense.expenseDate).toISOString(), name: expense.name,
      type: expenseNames.get(expense.type) || expense.type.replaceAll("_", " "), amount: expense.amount, origin: expense.origin,
      outletId: expense.outletId ? String(expense.outletId) : undefined, expenseCategory: expense.expenseCategory, remarks: expense.remarks })),
    outlets.map((outlet) => ({ id: String(outlet._id), name: outlet.name, code: outlet.code })));
  return NextResponse.json({ success: true, range: { start: start.toISOString(), end: end.toISOString() }, generatedAt: manilaDateString(), ...report, allocations });
}
