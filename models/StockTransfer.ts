// models/StockTransfer.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

/**
 * Stock transfer (delivery order) from the main branch bodega to an outlet.
 *
 * Status workflow:
 *   DRAFT        — editable, no stock movement yet
 *   IN_TRANSIT   — dispatched ("Pending Delivery"); bodega stock deducted
 *   DELIVERED    — outlet marked the goods as physically arrived (optional step)
 *   CONFIRMED    — outlet counted and accepted quantities; outlet stock increased
 *   CANCELLED    — voided; if it was IN_TRANSIT, bodega stock was restored
 */
export type StockTransferStatus =
  | "DRAFT"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CONFIRMED"
  | "CANCELLED";

export interface IStockTransfer extends Document {
  _id: Types.ObjectId;
  transferNumber: string;
  outletId: Types.ObjectId;
  saleId?: Types.ObjectId;
  status: StockTransferStatus;
  transferDate: Date;

  totalItems: number;
  totalQty: number;
  totalReceivedQty: number;
  totalVarianceQty: number;
  hasDiscrepancy: boolean;

  remarks?: string;
  outletRemarks?: string;

  dispatchedAt?: Date;
  deliveredAt?: Date;
  confirmedAt?: Date;
  cancelledAt?: Date;

  createdBy?: Types.ObjectId;
  dispatchedBy?: Types.ObjectId;
  confirmedBy?: Types.ObjectId;
  cancelledBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const StockTransferSchema = new Schema<IStockTransfer>(
  {
    transferNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },

    outletId: {
      type: Schema.Types.ObjectId,
      ref: "Outlet",
      required: true,
    },

    saleId: {
      type: Schema.Types.ObjectId,
      ref: "Sale",
      required: false,
    },

    status: {
      type: String,
      enum: ["DRAFT", "IN_TRANSIT", "DELIVERED", "CONFIRMED", "CANCELLED"],
      default: "DRAFT",
      required: true,
    },

    transferDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    totalItems: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalQty: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalReceivedQty: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalVarianceQty: {
      type: Number,
      default: 0,
      min: 0,
    },

    hasDiscrepancy: {
      type: Boolean,
      default: false,
    },

    remarks: {
      type: String,
      trim: true,
      default: "",
    },

    outletRemarks: {
      type: String,
      trim: true,
      default: "",
    },

    dispatchedAt: { type: Date },
    deliveredAt: { type: Date },
    confirmedAt: { type: Date },
    cancelledAt: { type: Date },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    dispatchedBy: { type: Schema.Types.ObjectId, ref: "User" },
    confirmedBy: { type: Schema.Types.ObjectId, ref: "User" },
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
  }
);

StockTransferSchema.index({ outletId: 1, status: 1, createdAt: -1 });
StockTransferSchema.index({ saleId: 1 }, { unique: true, sparse: true });
StockTransferSchema.index({ status: 1, createdAt: -1 });
StockTransferSchema.index({ transferDate: -1 });
StockTransferSchema.index({ hasDiscrepancy: 1 });

const StockTransferModel: Model<IStockTransfer> =
  mongoose.models.StockTransfer ||
  mongoose.model<IStockTransfer>("StockTransfer", StockTransferSchema);

export default StockTransferModel;
