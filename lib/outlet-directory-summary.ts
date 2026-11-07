import { salesReportAmounts } from "@/lib/sales-report-amounts";

type Sale = { _id: unknown; outletId?: unknown; totalAmount?: number; discountAmount?: number };
type Line = { saleId: unknown; qty?: number; baseQty?: number; stockPcsOut?: number; unitCost?: number; lineTotal?: number; grossLineTotal?: number; discountAmount?: number };
type Expense = { outletId?: unknown; amount?: number };
export function outletDirectorySummary(ids: string[], sales: Sale[], lines: Line[], expenses: Expense[]) {
  const result = new Map(ids.map(id => [id, { grossSales: 0, discounts: 0, cogs: 0, netSales: 0, expenses: 0, netProfit: 0 }]));
  const bySale = new Map<string, Line[]>();
  for (const line of lines) { const id = String(line.saleId); const group = bySale.get(id) || []; group.push(line); bySale.set(id, group); }
  for (const sale of sales) {
    const row = result.get(String(sale.outletId)); if (!row) continue;
    const saleLines = bySale.get(String(sale._id)) || [];
    // Older invoices store the discount on the sale; newer ones can store it
    // per line. Use the saved total once, never add both snapshots together.
    const discounts = Math.max(Number(sale.discountAmount || 0), saleLines.reduce((sum, line) => sum + salesReportAmounts(line).discounts, 0));
    row.netSales += Number(sale.totalAmount || 0);
    row.discounts += discounts;
    row.grossSales += Number(sale.totalAmount || 0) + discounts;
    row.cogs += saleLines.reduce((sum, line) => sum + Number(line.baseQty ?? line.stockPcsOut ?? line.qty ?? 0) * Number(line.unitCost || 0), 0);
  }
  for (const expense of expenses) { const row = result.get(String(expense.outletId)); if (row) row.expenses += Number(expense.amount || 0); }
  for (const row of result.values()) {
    for (const key of ["grossSales", "discounts", "cogs", "netSales", "expenses"] as const) row[key] = Math.round(row[key] * 100) / 100;
    row.netProfit = Math.round((row.netSales - row.cogs - row.expenses) * 100) / 100;
  }
  return result;
}
