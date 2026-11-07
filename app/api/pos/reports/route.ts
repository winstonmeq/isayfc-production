import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { parseReportRange, roundMoney } from "@/lib/report-utils";
import { outletReportTotals } from "@/lib/outlet-report-totals";
import Sale from "@/models/Sale";
import SaleLine from "@/models/SaleLine";
import Expense from "@/models/Expense";
import Ledger from "@/models/OutletStockTransaction";
import { OutletEmployeeCash } from "@/models/OutletEmployeeFinance";

export async function GET(req: NextRequest) {
  const { response, session } = await requirePermission(["pos.view", "pos.manage"]);
  if (response) return response;
  await dbConnect();
  const outletId = req.nextUrl.searchParams.get("outletId") || "";
  if (!await findAuthorizedPosOutlet(session!.user.id, outletId)) return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 403 });
  const { start, end } = parseReportRange(req.nextUrl.searchParams);
  if (start >= end) return NextResponse.json({ success: false, message: "Select a valid date range." }, { status: 400 });
  const [sales, expenses, production, movements] = await Promise.all([
    Sale.find({ outletId, isVoided: false, source: "OUTLET", saleDate: { $gte: start, $lt: end } }).sort({ saleDate: 1 }).lean(),
    Expense.find({ outletId, expenseCategory: "OUTLET", isActive: true, expenseDate: { $gte: start, $lt: end } }).sort({ expenseDate: 1 }).lean(),
    Ledger.find({ outletId, type: "REPACK_IN", transactionDate: { $gte: start, $lt: end } }).sort({ transactionDate: 1 }).lean(),
    OutletEmployeeCash.find({ outletId, businessDate: { $gte: start, $lt: end } }).sort({ businessDate: 1 }).lean(),
  ]);
  const lines = await SaleLine.find({ saleId: { $in: sales.map(sale => sale._id) } }).lean();
  const saleRows = sales.map(sale => {
    const items = lines.filter(line => String(line.saleId) === String(sale._id));
    const cogs = roundMoney(items.reduce((sum, line) => sum + Number(line.baseQty ?? line.stockPcsOut ?? line.qty ?? 0) * Number(line.unitCost || 0), 0));
    return { id: String(sale._id), date: sale.saleDate, receipt: sale.receiptNumber, products: items.map(line => line.productName).join(", "), qty: sale.totalQty, sales: sale.totalAmount, cogs, grossProfit: roundMoney(sale.totalAmount - cogs), payment: sale.paymentMethod || "CASH" };
  });
  const expenseRows = expenses.map(expense => ({ id: String(expense._id), date: expense.expenseDate, description: expense.name, type: expense.type, amount: expense.amount, cash: expense.deductFromCashSale === false ? 0 : expense.amount, origin: expense.origin || "MANUAL" }));
  const productionRows = production.map(row => ({ id: String(row._id), date: row.transactionDate, batch: String(row.referenceId || row._id), product: row.productName, qty: row.quantity, unitCost: row.unitCost, cost: roundMoney(row.quantity * row.unitCost) }));
  const cashRows = [
    ...saleRows.filter(row => row.payment.toUpperCase() === "CASH").map(row => ({ id: row.id, date: row.date, reference: row.receipt, description: "Cash sale", cashIn: row.sales, cashOut: 0 })),
    ...expenseRows.filter(row => row.cash > 0).map(row => ({ id: row.id, date: row.date, reference: row.type, description: row.description, cashIn: 0, cashOut: row.cash })),
    ...movements.map(row => ({ id: String(row._id), date: row.businessDate, reference: String(row.referenceId), description: `${row.employeeName} — ${row.kind}`, cashIn: row.kind === "EMPLOYEE_COLLECTION" ? Number(row.amount) : 0, cashOut: row.kind === "EMPLOYEE_REIMBURSEMENT" ? Number(row.amount) : 0 })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const { revenue, cogs, expenseTotal } = outletReportTotals(saleRows, expenseRows, cashRows);
  const profitRows = [
    { id: "sales", description: "Outlet Sales", amount: revenue },
    { id: "cogs", description: "Less: Historical Cost of Goods Sold", amount: -cogs },
    { id: "gross", description: "Gross Profit", amount: roundMoney(revenue - cogs) },
    ...[...new Set(expenses.map(row => row.type))].map(type => ({ id: type, description: `Less: ${type.replaceAll("_", " ")}`, amount: -roundMoney(expenses.filter(row => row.type === type).reduce((sum, row) => sum + row.amount, 0)) })),
    { id: "net", description: "Net Profit / Loss", amount: roundMoney(revenue - cogs - expenseTotal) },
  ];
  return NextResponse.json({ success: true, range: { start, end }, sales: saleRows, expenses: expenseRows, production: productionRows, cash: cashRows, profit: profitRows });
}
