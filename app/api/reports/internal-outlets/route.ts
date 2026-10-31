import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { parseReportRange } from "@/lib/report-utils";
import { internalOutletMatchClauses } from "@/lib/internal-outlet";
import Sale from "@/models/Sale";
import SaleLine from "@/models/SaleLine";
import Expense from "@/models/Expense";
import StockTransfer from "@/models/StockTransfer";
import StockTransferItem from "@/models/StockTransferItem";
import Outlet from "@/models/Outlet";

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("reports.profit");
  if (response) return response;
  await dbConnect(); void Outlet;
  const { start, end } = parseReportRange(req.nextUrl.searchParams);
  if (start >= end) return NextResponse.json({ success: false, message: "Date From must not be after Date To." }, { status: 400 });
  const [transfers, sales, expenses] = await Promise.all([
    StockTransfer.find({ transferDate: { $gte: start, $lt: end }, status: { $ne: "CANCELLED" } }).populate("outletId", "name code").sort({ transferDate: -1 }).lean(),
    Sale.find({ isVoided: false, fulfillmentStatus: { $ne: "PENDING" }, saleDate: { $gte: start, $lt: end }, $nor: internalOutletMatchClauses() }).select("source totalAmount").lean(),
    Expense.find({ isActive: true, expenseDate: { $gte: start, $lt: end } }).select("amount").lean(),
  ]);
  const [items, lines, linkedOrders] = await Promise.all([
    StockTransferItem.find({ transferId: { $in: transfers.map(row => row._id) } }).lean(),
    SaleLine.find({ saleId: { $in: sales.map(row => row._id) } }).select("saleId unitCost companyUnitCost baseQty stockPcsOut qty").lean(),
    Sale.find({ _id: { $in: transfers.flatMap(row => row.saleId ? [row.saleId] : []) } }).select("paidAmount transactionType").lean(),
  ]);
  const rows = transfers.map(transfer => {
    const own = items.filter(item => String(item.transferId) === String(transfer._id));
    const value = own.reduce((sum, item) => sum + item.qty * item.sellingPrice, 0);
    const missing = own.some(item => item.companyUnitCost == null);
    const originalCost = missing ? null : own.reduce((sum, item) => sum + Number(item.baseQty ?? item.qtyPcs ?? item.qty) * Number(item.companyUnitCost), 0);
    const outlet = transfer.outletId as unknown as { name?: string; code?: string };
    const linked = linkedOrders.find(order => String(order._id) === String(transfer.saleId));
    return { id: String(transfer._id), date: transfer.transferDate, number: transfer.transferNumber, outlet: outlet?.name || outlet?.code || "—", status: transfer.status, products: own.map(item => `${item.productName}: ${item.qty} ${item.unitLabel}`).join(", "), value, originalCost, internalMarkup: originalCost == null ? null : value - originalCost,
      financeReview: linked && linked.paidAmount > 0 ? `Legacy payment ${linked.paidAmount.toFixed(2)} — review, not automatically reversed` : "No customer debt" };
  });
  const saleById = new Map(sales.map(row => [String(row._id), row]));
  let cogs = 0, missingCostLines = 0;
  for (const line of lines) {
    const outlet = saleById.get(String(line.saleId))?.source === "OUTLET";
    const cost = outlet ? line.companyUnitCost : line.unitCost;
    if (cost == null || !Number.isFinite(cost)) { missingCostLines++; continue; }
    cogs += cost * Number(line.baseQty ?? line.stockPcsOut ?? line.qty ?? 0);
  }
  // Old records without lines cannot silently appear to have zero COGS.
  missingCostLines += sales.filter(sale => sale.totalAmount > 0 && !lines.some(line => String(line.saleId) === String(sale._id))).length;
  const mainSales = sales.filter(row => row.source !== "OUTLET").reduce((sum, row) => sum + row.totalAmount, 0);
  const outletSales = sales.filter(row => row.source === "OUTLET").reduce((sum, row) => sum + row.totalAmount, 0);
  const totalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);
  return NextResponse.json({ success: true, rows, period: { start, end }, consolidated: { mainSales, outletSales, revenue: mainSales + outletSales, cogs: missingCostLines ? null : cogs, knownCogs: cogs, expenses: totalExpenses, netProfit: missingCostLines ? null : mainSales + outletSales - cogs - totalExpenses, missingCostLines } });
}
