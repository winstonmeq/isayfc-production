export function purchasePageTotals(rows: Array<{ lineCount?: number; totalItems: number; totalAmount: number; paidAmount?: number; balance?: number | null }>) {
  return rows.reduce((total, row) => ({
    lines: total.lines + Number(row.lineCount || 0),
    quantity: total.quantity + Number(row.totalItems || 0),
    amount: Math.round((total.amount + Number(row.totalAmount || 0)) * 100) / 100,
    paid: Math.round((total.paid + (row.balance == null ? 0 : Number(row.paidAmount || 0))) * 100) / 100,
    balance: Math.round((total.balance + Number(row.balance || 0)) * 100) / 100,
  }), { lines: 0, quantity: 0, amount: 0, paid: 0, balance: 0 });
}
