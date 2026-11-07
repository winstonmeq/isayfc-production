import { getSaleOrigin, outletSaleMatchClauses } from "./sale-origin";
import { internalOutletMatchClauses, isInternalOutletTransaction } from "./internal-outlet";
import { recognizedSaleRange } from "./business-flow";
import { salesReportAmounts } from "./sales-report-amounts";
import { roundMoney } from "./report-utils";

export type OverallSale = {
  id: string; source?: string; channel?: string; remarks?: string; transactionType?: string;
  receiptNumber?: string; outletId?: string; ownerOutletId?: string; date: string; customer: string;
  totalAmount?: number; subtotal?: number; discountAmount?: number;
  returnAmount?: number; returnCost?: number;
};
export type OverallLine = {
  saleId: string; productName?: string; qty?: number; baseQty?: number; stockPcsOut?: number;
  unitCost?: number | null; companyUnitCost?: number | null;
};
export type OverallExpense = { id: string; date: string; name: string; type: string; amount: number; companyAmount?: number; origin?: string; capitalizedByBatch?: unknown; outletId?: string; expenseCategory?: string; remarks?: string };
type Outlet = { id: string; name: string; code?: string };

/** Main recognition day and outlet retail business day match their own reports. */
export function overallSalesFilter(start: Date, end: Date) {
  return { isVoided: false, fulfillmentStatus: { $ne: "PENDING" as const }, $nor: [...internalOutletMatchClauses(), { ownerOutletId: { $exists: true, $ne: null } }],
    $or: [
      { $and: [{ $or: outletSaleMatchClauses() }, { saleDate: { $gte: start, $lt: end } }] },
      { $and: [{ $nor: outletSaleMatchClauses() }, { $expr: recognizedSaleRange(start, end) }] },
    ] };
}

/** Original cost only. Never substitute the outlet's marked-up buying price. */
export function overallLineCost(line: OverallLine, outlet: boolean) {
  const unitCost = outlet ? line.companyUnitCost : line.unitCost;
  const qty = line.baseQty ?? line.stockPcsOut ?? line.qty;
  return unitCost == null || qty == null || !Number.isFinite(unitCost) || !Number.isFinite(qty) || unitCost < 0 || qty < 0
    ? null : unitCost * qty;
}

export function buildOverallBusinessReport(sales: OverallSale[], lines: OverallLine[], expenses: OverallExpense[], outlets: Outlet[]) {
  const directory = new Map(outlets.map((outlet) => [outlet.id, outlet]));
  const branchName = (key: string) => key === "MAIN" ? "Main Branch" : directory.get(key)?.name || (key === "UNASSIGNED" ? "Unassigned Outlet" : "Deleted / unknown outlet");
  const branchKey = (outletId?: string) => outletId || "UNASSIGNED";
  const linesBySale = new Map<string, OverallLine[]>();
  for (const line of lines) { const own = linesBySale.get(line.saleId) || []; own.push(line); linesBySale.set(line.saleId, own); }
  const rows = sales.filter((sale) => !isInternalOutletTransaction(sale) && !sale.ownerOutletId).map((sale) => {
    const outlet = getSaleOrigin(sale) === "OUTLET";
    const legacyOutlet = sale.remarks?.match(/OUTLET:([a-f\d]{24})\b/i)?.[1];
    const branchId = outlet ? branchKey(sale.outletId || legacyOutlet) : "MAIN";
    const own = linesBySale.get(sale.id) || [];
    const costs = own.map((line) => overallLineCost(line, outlet));
    const missingCostLines = sale.returnAmount != null ? 0 : own.length ? costs.filter((cost) => cost === null).length : 1;
    const knownCogs = sale.returnAmount != null ? -Number(sale.returnCost || 0) : roundMoney(costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0));
    const amounts = sale.returnAmount != null ? { grossSales: 0, discounts: 0, netSales: -sale.returnAmount } : salesReportAmounts(sale);
    return { id: sale.id, date: sale.date, branchId, branch: branchName(branchId), outlet,
      receiptNumber: sale.receiptNumber || "", customer: sale.customer,
      products: sale.returnAmount != null ? "Posted customer return" : own.map((line) => `${line.productName || "Unnamed product"}: ${line.qty ?? 0}`).join(", "),
      ...amounts, salesReturns: Number(sale.returnAmount || 0), knownCogs, missingCostLines, cogs: missingCostLines ? null : knownCogs,
      grossProfit: missingCostLines ? null : roundMoney(amounts.netSales - knownCogs) };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const expenseRows = expenses.filter((expense) => !expense.capitalizedByBatch && expense.origin !== "OWNER_OUTLET_DELIVERY" && expense.type !== "OWNER_OUTLET_DELIVERY").map((expense) => {
    const legacyOutlet = expense.remarks?.match(/OUTLET:([a-f\d]{24})\b/i)?.[1];
    const outlet = !!expense.outletId || !!legacyOutlet || expense.expenseCategory === "OUTLET";
    const branchId = outlet ? branchKey(expense.outletId || legacyOutlet) : "MAIN";
    const amount = ["STOCK_USAGE", "PRODUCTION_USAGE"].includes(expense.origin || "") && expense.companyAmount != null ? expense.companyAmount : expense.amount;
    return { ...expense, branchId, branch: branchName(branchId), amount: roundMoney(amount) };
  });
  const keys = new Set(["MAIN", ...rows.map((row) => row.branchId), ...expenseRows.map((row) => row.branchId)]);
  const summarize = (own: typeof rows, ownExpenses: typeof expenseRows) => {
    const sum = (field: "grossSales" | "discounts" | "netSales" | "knownCogs" | "missingCostLines") => roundMoney(own.reduce((total, row) => total + row[field], 0));
    const missingCostLines = sum("missingCostLines");
    const knownCogs = sum("knownCogs");
    const netSales = sum("netSales");
    const operatingExpenses = roundMoney(ownExpenses.reduce((total, row) => total + row.amount, 0));
    return { transactions: own.length, grossSales: sum("grossSales"), discounts: sum("discounts"), netSales,
      salesReturns: roundMoney(own.reduce((n, row) => n + row.salesReturns, 0)),
      knownCogs, missingCostLines, cogs: missingCostLines ? null : knownCogs,
      grossProfit: missingCostLines ? null : roundMoney(netSales - knownCogs), operatingExpenses,
      netProfit: missingCostLines ? null : roundMoney(netSales - knownCogs - operatingExpenses) };
  };
  const branches = [...keys].map((id) => ({ id, name: branchName(id), ...summarize(rows.filter((row) => row.branchId === id), expenseRows.filter((row) => row.branchId === id)) }));
  return { rows, expenseRows, branches, totals: summarize(rows, expenseRows),
    mainSales: roundMoney(rows.filter((row) => !row.outlet).reduce((sum, row) => sum + row.netSales, 0)),
    outletSales: roundMoney(rows.filter((row) => row.outlet).reduce((sum, row) => sum + row.netSales, 0)) };
}

export type OverallBusinessReport = ReturnType<typeof buildOverallBusinessReport>;
