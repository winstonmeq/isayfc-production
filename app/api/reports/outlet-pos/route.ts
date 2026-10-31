import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId, Types } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { reportOutletDirectory } from "@/lib/business-flow";
import { manilaDateString } from "@/lib/date-utils";
import { outletSaleMatchClauses } from "@/lib/sale-origin";
import { parseReportRange, roundMoney } from "@/lib/report-utils";
import { requirePermission } from "@/lib/require-permission";
import ExpenseModel from "@/models/Expense";
import OutletModel from "@/models/Outlet";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(["reports.sales", "reports.profit"]);
  if (response) return response;
  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { start, end } = parseReportRange(searchParams);
  const outletId = String(searchParams.get("outletId") || "");
  if (outletId && outletId !== "ALL" && !isValidObjectId(outletId)) {
    return NextResponse.json({ success: false, message: "Invalid outlet filter." }, { status: 400 });
  }

  const outletMatch = outletSaleMatchClauses();
  const saleFilter: Record<string, unknown> = {
    isVoided: false,
    saleDate: { $gte: start, $lt: end },
    $or: outletMatch,
  };
  if (outletId && outletId !== "ALL") {
    saleFilter.$and = [
      { $or: outletMatch },
      { $or: [{ outletId: new Types.ObjectId(outletId) }, { remarks: { $regex: `OUTLET:${outletId}`, $options: "i" } }] },
    ];
    delete saleFilter.$or;
  }

  const [outlets, sales] = await Promise.all([
    OutletModel.find({}).select("name code").sort({ name: 1 }).lean<any[]>(),
    SaleModel.find(saleFilter)
      .select("receiptNumber saleDate outletId totalQty totalAmount paidAmount paymentMethod status employeeName")
      .sort({ saleDate: 1, createdAt: 1 })
      .lean<any[]>(),
  ]);
  const saleIds = sales.map((sale) => sale._id);
  const lines = saleIds.length
    ? await SaleLineModel.find({ saleId: { $in: saleIds } })
        .select("saleId productName categoryName qty baseQty stockPcsOut lineTotal unitCost")
        .lean<any[]>()
    : [];
  const linesBySale = new Map<string, any[]>();
  const outletsById = new Map(outlets.map((outlet) => [String(outlet._id), outlet]));
  for (const line of lines) {
    const key = String(line.saleId);
    linesBySale.set(key, [...(linesBySale.get(key) || []), line]);
  }

  const rows = sales.map((sale) => {
    const saleLines = linesBySale.get(String(sale._id)) || [];
    const cogs = roundMoney(saleLines.reduce((sum, line) => sum + Number(line.baseQty ?? line.stockPcsOut ?? line.qty ?? 0) * Number(line.unitCost || 0), 0));
    const salesAmount = roundMoney(Number(sale.totalAmount || 0));
    return {
      id: String(sale._id),
      saleDate: sale.saleDate,
      receiptNumber: sale.receiptNumber || "",
      outletId: String(sale.outletId || ""),
      outletName: outletsById.get(String(sale.outletId))?.name || "Deleted / unassigned outlet",
      outletCode: outletsById.get(String(sale.outletId))?.code || "",
      qty: Number(sale.totalQty || 0),
      items: saleLines.map((line) => line.productName).filter(Boolean).join(", "),
      sales: salesAmount,
      cogs,
      grossProfit: roundMoney(salesAmount - cogs),
      paid: roundMoney(Number(sale.paidAmount || 0)),
      paymentMethod: sale.paymentMethod || "CASH",
      employeeName: sale.employeeName || "",
      status: sale.status || "PAID",
    };
  });

  const expenseFilter: Record<string, unknown> = {
    isActive: true,
    expenseDate: { $gte: start, $lt: end },
    expenseCategory: "OUTLET",
  };
  if (outletId && outletId !== "ALL") expenseFilter.outletId = new Types.ObjectId(outletId);
  const expenses = await ExpenseModel.aggregate<{ _id: unknown; total: number }>([
    { $match: expenseFilter },
    { $group: { _id: "$outletId", total: { $sum: "$amount" } } },
  ]);
  const expenseByOutlet = new Map(expenses.map((row) => [String(row._id || ""), roundMoney(Number(row.total || 0))]));
  const reportOutlets = reportOutletDirectory(outlets, rows.map((row) => row.outletId), expenses.map((row) => String(row._id || "")));

  const outletRows = reportOutlets
    .filter((outlet) => !outletId || outletId === "ALL" || String(outlet._id) === outletId)
    .map((outlet) => {
      const id = String(outlet._id);
      const outletSales = rows.filter((row) => row.outletId === id);
      const salesTotal = roundMoney(outletSales.reduce((sum, row) => sum + row.sales, 0));
      const cogs = roundMoney(outletSales.reduce((sum, row) => sum + row.cogs, 0));
      const expensesTotal = expenseByOutlet.get(id) || 0;
      return { outletId: id, name: outlet.name, code: outlet.code, transactions: outletSales.length, sales: salesTotal, cogs, grossProfit: roundMoney(salesTotal - cogs), expenses: expensesTotal, netProfit: roundMoney(salesTotal - cogs - expensesTotal) };
    });
  const totals = outletRows.reduce((total, row) => ({ transactions: total.transactions + row.transactions, sales: roundMoney(total.sales + row.sales), cogs: roundMoney(total.cogs + row.cogs), grossProfit: roundMoney(total.grossProfit + row.grossProfit), expenses: roundMoney(total.expenses + row.expenses), netProfit: roundMoney(total.netProfit + row.netProfit) }), { transactions: 0, sales: 0, cogs: 0, grossProfit: 0, expenses: 0, netProfit: 0 });

  const productMap = new Map<string, { product: string; category: string; qty: number; sales: number; cogs: number }>();
  for (const line of lines) {
    const key = `${line.categoryName || "OTHER"}:${line.productName || "UNNAMED"}`;
    const current = productMap.get(key) || { product: line.productName || "UNNAMED", category: line.categoryName || "OTHER", qty: 0, sales: 0, cogs: 0 };
    current.qty += Number(line.qty || 0);
    current.sales = roundMoney(current.sales + Number(line.lineTotal || 0));
    current.cogs = roundMoney(current.cogs + Number(line.baseQty ?? line.stockPcsOut ?? line.qty ?? 0) * Number(line.unitCost || 0));
    productMap.set(key, current);
  }

  return NextResponse.json({ success: true, range: { start: start.toISOString(), end: end.toISOString() }, generatedAt: manilaDateString(), outlets: reportOutlets.filter((outlet) => String(outlet._id)).map((outlet) => ({ id: String(outlet._id), name: outlet.name, code: outlet.code })), rows, outletRows, products: [...productMap.values()].map((row) => ({ ...row, grossProfit: roundMoney(row.sales - row.cogs) })).sort((a, b) => b.sales - a.sales), totals });
}
