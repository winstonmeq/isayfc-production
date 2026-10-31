import type { ClientSession, Types } from "mongoose";
import Supplier from "@/models/Supplier";
import Invoice from "@/models/SupplierInvoice";
import Payment from "@/models/SupplierPayment";
import { invoiceSettlement, type purchaseFinanceInput } from "./purchase-finance";

export async function syncPurchaseInvoice(batchId: Types.ObjectId, input: ReturnType<typeof purchaseFinanceInput>, amount: number, userId: string, session: ClientSession) {
  if (!await Supplier.exists({ _id: input.supplierId, isActive: true }).session(session)) throw new Error("Supplier is unavailable. Select an active supplier.");
  let invoice = await Invoice.findOne({ purchaseBatchId: batchId }).session(session);
  if (invoice?.status === "VOID") throw new Error("The linked invoice has been voided.");
  if (invoice && Number(invoice.paidAmount) > 0 && String(invoice.supplierId) !== input.supplierId) throw new Error("Supplier cannot change after a payment has been recorded.");
  const settlement = invoiceSettlement(amount, Number(invoice?.paidAmount || 0), input.paymentMode === "CASH");
  if (!invoice) {
    [invoice] = await Invoice.create([{ supplierId: input.supplierId, invoiceNumber: input.invoiceNumber, invoiceDate: input.invoiceDate, dueDate: input.dueDate, amount: settlement.amount, balance: settlement.amount, referenceType: "PURCHASE_BATCH", referenceId: batchId, purchaseBatchId: batchId, remarks: `AUTO-CREATED FROM GROCERY PURCHASE ${batchId}`, createdBy: userId }], { session });
  }
  if (settlement.payment > 0) {
    await Payment.create([{ supplierInvoiceId: invoice._id, supplierId: input.supplierId, paymentDate: new Date(), amount: settlement.payment, paymentMethod: "CASH", referenceNumber: input.invoiceNumber, remarks: `CASH SETTLEMENT FROM GROCERY PURCHASE ${batchId}`, createdBy: userId }], { session });
  }
  Object.assign(invoice, { supplierId: input.supplierId, invoiceNumber: input.invoiceNumber, invoiceDate: input.invoiceDate, dueDate: input.dueDate, amount: settlement.amount, paidAmount: settlement.paidAmount, balance: settlement.balance, status: settlement.status });
  await invoice.save({ session });
  return invoice;
}

export async function voidPurchaseInvoice(batchId: Types.ObjectId, session: ClientSession) {
  const invoice = await Invoice.findOne({ purchaseBatchId: batchId }).session(session);
  if (!invoice) return; // Legacy stock-only purchase.
  if (Number(invoice.paidAmount) > 0) throw new Error("Cannot void a purchase with supplier payments. A finance correction is required first.");
  invoice.status = "VOID"; invoice.balance = 0;
  await invoice.save({ session });
}
