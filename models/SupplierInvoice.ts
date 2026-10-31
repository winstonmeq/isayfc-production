import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface ISupplierInvoice extends Document {
  _id: Types.ObjectId;
  supplierId: Types.ObjectId;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  amount: number;
  paidAmount: number;
  balance: number;
  status: "UNPAID" | "PARTIAL" | "PAID" | "VOID";
  referenceType?: string;
  referenceId?: Types.ObjectId;
  purchaseBatchId?: Types.ObjectId;
  remarks?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierInvoiceSchema = new Schema<ISupplierInvoice>({
  supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
  invoiceNumber: { type: String, required: true, trim: true, uppercase: true },
  invoiceDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  amount: { type: Number, required: true, min: 0.01 },
  paidAmount: { type: Number, default: 0, min: 0 },
  balance: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["UNPAID", "PARTIAL", "PAID", "VOID"], default: "UNPAID" },
  referenceType: { type: String, default: "", trim: true, uppercase: true },
  referenceId: Schema.Types.ObjectId,
  purchaseBatchId: { type: Schema.Types.ObjectId, ref: "PurchaseBatch" },
  remarks: { type: String, default: "", trim: true, uppercase: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

SupplierInvoiceSchema.index({ supplierId: 1, invoiceNumber: 1 }, { unique: true });
SupplierInvoiceSchema.index({ dueDate: 1, status: 1 });
SupplierInvoiceSchema.index({ purchaseBatchId: 1 }, { unique: true, sparse: true });
SupplierInvoiceSchema.index(
  { referenceType: 1, referenceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      referenceType: "DELIVERY",
      referenceId: { $type: "objectId" },
    },
  }
);
const SupplierInvoiceModel: Model<ISupplierInvoice> = mongoose.models.SupplierInvoice || mongoose.model<ISupplierInvoice>("SupplierInvoice", SupplierInvoiceSchema);
export default SupplierInvoiceModel;
