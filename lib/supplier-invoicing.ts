import type { ClientSession, Types } from "mongoose";

import SupplierInvoiceModel from "@/models/SupplierInvoice";

type DeliveryInvoiceInput = {
  deliveryId: Types.ObjectId;
  supplierId: Types.ObjectId | string;
  receiptNumber: string;
  deliveryCode: string;
  deliveryDate: Date;
  totalAmount: number;
  createdBy?: string;
  session: ClientSession;
};

export async function syncDeliverySupplierInvoice(input: DeliveryInvoiceInput) {
  const amount = Math.round(Number(input.totalAmount || 0) * 100) / 100;
  if (amount <= 0) return null;

  const invoiceNumber = String(input.receiptNumber || input.deliveryCode).trim().toUpperCase();
  const existing = await SupplierInvoiceModel.findOne({
    referenceType: "DELIVERY",
    referenceId: input.deliveryId,
  }).session(input.session);

  if (existing) {
    if (Number(existing.paidAmount || 0) > amount + 0.0001) {
      throw new Error("Delivery total cannot be lower than payments already applied to its supplier invoice.");
    }
    if (
      Number(existing.paidAmount || 0) > 0 &&
      String(existing.supplierId) !== String(input.supplierId)
    ) {
      throw new Error("Supplier cannot be changed after a supplier payment has been recorded.");
    }

    existing.supplierId = input.supplierId as any;
    existing.invoiceNumber = invoiceNumber;
    existing.invoiceDate = input.deliveryDate;
    existing.dueDate = input.deliveryDate;
    existing.amount = amount;
    existing.balance = Math.max(0, amount - Number(existing.paidAmount || 0));
    existing.status = existing.balance <= 0.0001
      ? "PAID"
      : Number(existing.paidAmount || 0) > 0
        ? "PARTIAL"
        : "UNPAID";
    await existing.save({ session: input.session });
    return existing;
  }

  const [created] = await SupplierInvoiceModel.create(
    [{
      supplierId: input.supplierId,
      invoiceNumber,
      invoiceDate: input.deliveryDate,
      dueDate: input.deliveryDate,
      amount,
      paidAmount: 0,
      balance: amount,
      status: "UNPAID",
      referenceType: "DELIVERY",
      referenceId: input.deliveryId,
      remarks: `AUTO-CREATED FROM DELIVERY ${input.deliveryCode}`,
      createdBy: input.createdBy,
    }],
    { session: input.session }
  );
  return created;
}

export async function voidDeliverySupplierInvoice(
  deliveryId: Types.ObjectId,
  session: ClientSession
) {
  const invoice = await SupplierInvoiceModel.findOne({
    referenceType: "DELIVERY",
    referenceId: deliveryId,
    status: { $ne: "VOID" },
  }).session(session);
  if (!invoice) return;
  if (Number(invoice.paidAmount || 0) > 0) {
    throw new Error("Remove supplier payments before voiding this delivery.");
  }
  invoice.status = "VOID";
  invoice.balance = 0;
  await invoice.save({ session });
}
