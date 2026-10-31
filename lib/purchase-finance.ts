import { parseExpenseDate } from "./expense-date";

export function purchaseFinanceInput(body: Record<string, unknown>) {
  const supplierId = String(body.supplierId || "").trim();
  const invoiceNumber = String(body.invoiceNumber || "").trim().toUpperCase();
  const invoiceDate = parseExpenseDate(String(body.datePurchased || ""));
  const dueDate = parseExpenseDate(String(body.dueDate || ""));
  const paymentMode = String(body.paymentMode || "CREDIT");
  if (!/^[a-f\d]{24}$/i.test(supplierId)) throw new Error("Select a supplier for this purchase.");
  if (!invoiceNumber || invoiceNumber.length > 120) throw new Error("Enter an invoice/receipt number (maximum 120 characters).");
  if (!invoiceDate || !dueDate || dueDate < invoiceDate) throw new Error("Enter valid purchase and due dates; the due date cannot precede the purchase.");
  if (paymentMode !== "CASH" && paymentMode !== "CREDIT") throw new Error("Select Cash or Credit.");
  return { supplierId, invoiceNumber, invoiceDate, dueDate, paymentMode: paymentMode as "CASH" | "CREDIT" };
}

export function invoiceSettlement(amount: number, paid: number, payNow: boolean) {
  amount = Math.round(amount * 100) / 100;
  paid = Math.round(paid * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Purchase total must be a valid amount greater than zero.");
  if (amount < paid) throw new Error("Purchase total cannot be lower than supplier payments already recorded.");
  const payment = payNow ? Math.round((amount - paid) * 100) / 100 : 0;
  const paidAmount = paid + payment;
  const balance = Math.round((amount - paidAmount) * 100) / 100;
  return { amount, payment, paidAmount, balance, status: balance === 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID" };
}

export function purchaseFinanceSnapshot(batch: any) {
  const invoice = batch.supplierInvoiceId;
  return {
    supplierId: String(batch.supplierId?._id || batch.supplierId || ""),
    supplierName: batch.supplierId?.name || "",
    supplierInvoiceId: String(invoice?._id || invoice || ""),
    invoiceNumber: batch.invoiceNumber || "",
    dueDate: batch.dueDate ? new Date(batch.dueDate).toISOString() : "",
    paymentMode: batch.paymentMode || "CREDIT",
    invoiceStatus: invoice?.status || (invoice ? "LINKED" : "NOT LINKED"),
    paidAmount: Number(invoice?.paidAmount || 0),
    balance: invoice?.balance === undefined ? null : Number(invoice.balance),
  };
}

export function samePurchaseLines(a: Array<{ productId: unknown; buyingPrice: number; quantity: number }>, b: Array<{ productId: unknown; buyingPrice: number; quantity: number }>) {
  const signature = (rows: typeof a) => rows.map((row) => `${String(row.productId)}:${Number(row.buyingPrice)}:${Number(row.quantity)}`).sort();
  return JSON.stringify(signature(a)) === JSON.stringify(signature(b));
}
