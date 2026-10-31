// models/PurchaseBatch.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IPurchaseBatch extends Document {
  _id: Types.ObjectId;
  datePurchased: Date;
  supplierId?: Types.ObjectId;
  supplierInvoiceId?: Types.ObjectId;
  invoiceNumber?: string;
  dueDate?: Date;
  paymentMode?: "CASH" | "CREDIT";
  totalItems: number;
  totalAmount: number;
  remarks?: string;
  createdBy?: Types.ObjectId;
  isVoided: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseBatchSchema = new Schema<IPurchaseBatch>(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    supplierInvoiceId: { type: Schema.Types.ObjectId, ref: "SupplierInvoice" },
    invoiceNumber: { type: String, trim: true, uppercase: true },
    dueDate: Date,
    paymentMode: { type: String, enum: ["CASH", "CREDIT"] },
    datePurchased: {
      type: Date,
      required: true,
      default: Date.now,
    },

    totalItems: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    isVoided: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

PurchaseBatchSchema.index({ datePurchased: -1 });
PurchaseBatchSchema.index({ isVoided: 1 });

const PurchaseBatchModel: Model<IPurchaseBatch> =
  mongoose.models.PurchaseBatch ||
  mongoose.model<IPurchaseBatch>("PurchaseBatch", PurchaseBatchSchema);

export default PurchaseBatchModel;
