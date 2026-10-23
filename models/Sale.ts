// models/Sale.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type SaleSource = "CHICKEN" | "BODEGA" | "MIXED" | "OUTLET";
export type SaleStatus = "PENDING" | "UNPAID" | "PARTIAL" | "PAID" | "VOIDED";
export type FulfillmentStatus = "DIRECT" | "PENDING" | "RECOGNIZED";
export type SaleChannel = "WEB" | "MOBILE";
export type PaymentMethod = "CASH" | "GCASH" | "CREDIT";

export interface ISale extends Document {
  _id: Types.ObjectId;
  receiptNumber: string;
  customerId?: Types.ObjectId;
  stockTransferId?: Types.ObjectId;
  saleDate: Date;
  source: SaleSource;
  // Outlet / shift / channel are now first-class fields (previously these were
  // only encoded in `remarks` as "OUTLET:<id> SHIFT:<id>"). Old rows have them
  // unset; readers fall back to the remarks tag for backward compatibility.
  outletId?: Types.ObjectId;
  shiftId?: Types.ObjectId;
  channel: SaleChannel;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  change?: number;
  // Client-supplied dedupe key for mobile sales. A cashier's app generates one
  // per cart-confirm and resends it on retry, so a timed-out-then-retried
  // request can't create a duplicate sale. Sparse: web sales omit it.
  idempotencyKey?: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  totalPacks: number;
  totalQty: number;
  remarks?: string;
  status: SaleStatus;
  fulfillmentStatus: FulfillmentStatus;
  recognizedAt?: Date;
  createdBy?: Types.ObjectId;
  isVoided: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SaleSchema = new Schema<ISale>(
  {
    receiptNumber: {
      type: String,
      required: true,
      trim: true,
    },

    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: false,
    },

    stockTransferId: {
      type: Schema.Types.ObjectId,
      ref: "StockTransfer",
      required: false,
    },

    saleDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    source: {
      type: String,
      enum: ["CHICKEN", "BODEGA", "MIXED", "OUTLET"],
      required: true,
    },

    outletId: {
      type: Schema.Types.ObjectId,
      ref: "Outlet",
      required: false,
    },

    shiftId: {
      type: Schema.Types.ObjectId,
      ref: "CashShift",
      required: false,
    },

    channel: {
      type: String,
      enum: ["WEB", "MOBILE"],
      default: "WEB",
    },

    paymentMethod: {
      type: String,
      enum: ["CASH", "GCASH", "CREDIT"],
      default: "CASH",
    },

    cashReceived: {
      type: Number,
      required: false,
      min: 0,
    },

    change: {
      type: Number,
      required: false,
      min: 0,
    },

    idempotencyKey: {
      type: String,
      required: false,
      trim: true,
    },

    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    balance: {
      type: Number,
      default: 0,
    },

    totalPacks: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalQty: {
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

    status: {
      type: String,
      enum: ["PENDING", "UNPAID", "PARTIAL", "PAID", "VOIDED"],
      default: "UNPAID",
    },

    fulfillmentStatus: {
      type: String,
      enum: ["DIRECT", "PENDING", "RECOGNIZED"],
      default: "DIRECT",
      required: true,
    },

    recognizedAt: { type: Date },

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

// receiptNumber must be globally unique — it's the duplicate guard the sale
// creation paths rely on when retrying generated numbers.
SaleSchema.index({ receiptNumber: 1 }, { unique: true });
SaleSchema.index({ customerId: 1 });
SaleSchema.index({ stockTransferId: 1 }, { sparse: true });
SaleSchema.index({ saleDate: -1 });
SaleSchema.index({ source: 1 });
SaleSchema.index({ status: 1 });
SaleSchema.index({ fulfillmentStatus: 1 });
SaleSchema.index({ isVoided: 1 });
// Shift / outlet reporting (cash-close, outlet-summary) query by these.
SaleSchema.index({ shiftId: 1 });
SaleSchema.index({ outletId: 1, saleDate: -1 });
// Idempotency: at most one sale per (outlet, key). Partial so only sales that
// carry a key are constrained — web sales (no key) are unaffected. This is the
// hard guard against duplicate sales from a retried mobile request.
SaleSchema.index(
  { outletId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

const SaleModel: Model<ISale> =
  mongoose.models.Sale || mongoose.model<ISale>("Sale", SaleSchema);

export default SaleModel;
