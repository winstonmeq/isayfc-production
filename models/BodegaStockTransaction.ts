// models/BodegaStockTransaction.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type BodegaStockTransactionType =
  | "STOCK_IN"
  | "STOCK_OUT"
  | "SALE"
  | "ADJUSTMENT"
  | "DAMAGED"
  | "EXPIRED"
  | "VOID_REVERSAL"
  | "CUSTOMER_DELIVERY";

export interface IBodegaStockTransaction extends Document {
  _id: Types.ObjectId;
  bodegaProductId: Types.ObjectId;
  transactionDate: Date;
  type: BodegaStockTransactionType;
  quantity: number;
  bags: number;
  kilos: number;
  heads: number;
  pieces: number;
  previousStock: number;
  newStock: number;
  remarks?: string;
  referenceType?: string;
  referenceId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BodegaStockTransactionSchema = new Schema<IBodegaStockTransaction>(
  {
    bodegaProductId: {
      type: Schema.Types.ObjectId,
      ref: "BodegaProduct",
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
        "ADJUSTMENT",
        "DAMAGED",
        "EXPIRED",
        "VOID_REVERSAL",
        "CUSTOMER_DELIVERY",
      ],
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    bags: { type: Number, default: 0, min: 0 },
    kilos: { type: Number, default: 0, min: 0 },
    heads: { type: Number, default: 0, min: 0 },
    pieces: { type: Number, default: 0, min: 0 },

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

BodegaStockTransactionSchema.index({ bodegaProductId: 1 });
BodegaStockTransactionSchema.index({ type: 1 });
BodegaStockTransactionSchema.index({ createdAt: -1 });
BodegaStockTransactionSchema.index({ transactionDate: -1 });

const BodegaStockTransactionModel: Model<IBodegaStockTransaction> =
  mongoose.models.BodegaStockTransaction ||
  mongoose.model<IBodegaStockTransaction>(
    "BodegaStockTransaction",
    BodegaStockTransactionSchema
  );

export default BodegaStockTransactionModel;
