// models/InventoryTransaction.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type InventoryTransactionType =
  | "STOCK_IN"
  | "STOCK_OUT"
  | "SALE"
  | "DELIVERY"
  | "SLICING"
  | "ADJUSTMENT"
  | "VOID_REVERSAL"
  | "CUSTOMER_DELIVERY";

export type InventoryUnit = "PCS" | "BAGS" | "KILOS";

export interface IInventoryTransaction extends Document {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  transactionDate: Date;
  type: InventoryTransactionType;
  unit: InventoryUnit;
  unitCode?: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  remarks?: string;
  referenceType?: string;
  referenceId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryTransactionSchema = new Schema<IInventoryTransaction>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    transactionDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    type: {
      type: String,
      enum: [
        "STOCK_IN",
        "STOCK_OUT",
        "SALE",
        "DELIVERY",
        "SLICING",
        "ADJUSTMENT",
        "VOID_REVERSAL",
        "CUSTOMER_DELIVERY",
      ],
      required: true,
    },

    unit: {
      type: String,
      enum: ["PCS", "BAGS", "KILOS"],
      required: true,
    },
    unitCode: { type: String, trim: true, uppercase: true },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    previousStock: {
      type: Number,
      required: true,
    },

    newStock: {
      type: Number,
      required: true,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },

    referenceType: {
      type: String,
      default: "",
      trim: true,
    },

    referenceId: {
      type: Schema.Types.ObjectId,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

InventoryTransactionSchema.index({ productId: 1 });
InventoryTransactionSchema.index({ type: 1 });
InventoryTransactionSchema.index({ createdAt: -1 });
InventoryTransactionSchema.index({ transactionDate: -1 });

if (mongoose.models.InventoryTransaction && !mongoose.models.InventoryTransaction.schema.path("unitCode")) mongoose.deleteModel("InventoryTransaction");
const InventoryTransactionModel: Model<IInventoryTransaction> =
  mongoose.models.InventoryTransaction ||
  mongoose.model<IInventoryTransaction>(
    "InventoryTransaction",
    InventoryTransactionSchema
  );

export default InventoryTransactionModel;
