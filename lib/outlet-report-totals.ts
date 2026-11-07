export function outletReportTotals(sales: Array<{ sales: number; cogs: number }>, expenses: Array<{ amount: number }>, cash: Array<{ cashIn: number; cashOut: number }>) {
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const revenue = round(sales.reduce((sum, row) => sum + row.sales, 0));
  const cogs = round(sales.reduce((sum, row) => sum + row.cogs, 0));
  const expenseTotal = round(expenses.reduce((sum, row) => sum + row.amount, 0));
  return { revenue, cogs, expenseTotal, grossProfit: round(revenue - cogs), netProfit: round(revenue - cogs - expenseTotal), netCash: round(cash.reduce((sum, row) => sum + row.cashIn - row.cashOut, 0)) };
}
