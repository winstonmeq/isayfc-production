import Return from "@/models/MainCustomerReturn";
export async function postedMainReturns(start: Date, end: Date, source?: string) {
  const rows = await Return.find({ status: "POSTED", postedAt: { $gte: start, $lt: end }, ...(["CHICKEN", "BODEGA"].includes(source || "") ? { source } : {}) }).sort({ postedAt: 1, _id: 1 }).lean();
  return rows.map(row => ({ id: String(row._id), saleId: String(row.saleId), date: new Date(row.postedAt).toISOString(), receipt: String(row.receiptNumber), product: String(row.productName), source: String(row.source), category: String(row.categoryName || ""), quantity: Number(row.quantity), unit: String(row.unit), amount: Number(row.creditAmount || 0), credit: Number(row.balanceCredit || 0), refund: Number(row.cashRefund || 0), restoredCost: Number(row.restoredCost || 0), refundReference: String(row.refundReference || ""), restocked: Boolean(row.restocked) }));
}
