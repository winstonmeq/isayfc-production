const money = (n: number) => Math.round(n * 100) / 100;
export function mainSaleBalance(sale: { totalAmount?: number; paidAmount?: number; returnedAmount?: number; refundedAmount?: number }) {
  return money(Math.max(0, Number(sale.totalAmount || 0) - Number(sale.returnedAmount || 0) - Number(sale.paidAmount || 0) + Number(sale.refundedAmount || 0)));
}
export function returnSettlement(sale: { totalAmount?: number; paidAmount?: number; returnedAmount?: number; refundedAmount?: number }, amount: number) {
  if (![sale.totalAmount || 0, sale.paidAmount || 0, sale.returnedAmount || 0, sale.refundedAmount || 0].every(n => Number.isFinite(n) && n >= 0)) throw new Error("Original sale settlement is invalid.");
  const available = money(Number(sale.totalAmount || 0) - Number(sale.returnedAmount || 0));
  if (!Number.isFinite(amount) || amount < 0 || money(amount) > available) throw new Error("Return exceeds the remaining original sale amount.");
  const credit = money(Math.min(mainSaleBalance(sale), amount));
  const refund = money(amount - credit);
  if (refund > money(Number(sale.paidAmount || 0) - Number(sale.refundedAmount || 0))) throw new Error("Refund exceeds the unrefunded customer payment.");
  return { credit, refund, balance: money(mainSaleBalance(sale) - credit) };
}
