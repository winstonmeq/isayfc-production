import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface ISupplierPayment extends Document {
  _id: Types.ObjectId;
  supplierInvoiceId: Types.ObjectId;
  supplierId: Types.ObjectId;
  paymentDate: Date;
  amount: number;
  paymentMethod: string;
  referenceNumber?: string;
  remarks?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierPaymentSchema = new Schema<ISupplierPayment>({
  supplierInvoiceId: { type: Schema.Types.ObjectId, ref: "SupplierInvoice", required: true },
  supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
  paymentDate: { type: Date, required: true, default: Date.now },
  amount: { type: Number, required: true, min: 0.01 },
  paymentMethod: { type: String, required: true, trim: true, uppercase: true },
  referenceNumber: { type: String, default: "", trim: true, uppercase: true },
  remarks: { type: String, default: "", trim: true, uppercase: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

SupplierPaymentSchema.index({ supplierInvoiceId: 1, paymentDate: -1 });
const SupplierPaymentModel: Model<ISupplierPayment> = mongoose.models.SupplierPayment || mongoose.model<ISupplierPayment>("SupplierPayment", SupplierPaymentSchema);
export default SupplierPaymentModel;
