/** Stable response shape even when the account has no accessible outlet. */
export function emptyPosDailyReport(date: string) {
  return {
    date, revenue: 0, cogs: 0, expenses: 0, grossProfit: 0, netProfit: 0,
    cash: { cashSales: 0, collections: 0, expenses: 0, reimbursements: 0, netCashMovement: 0 },
    transactions: [],
  };
}
