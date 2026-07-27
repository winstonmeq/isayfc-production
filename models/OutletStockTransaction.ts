// models/OutletStockTransaction.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type OutletStockTransactionType =
  | "STOCK_IN"
  | "STOCK_OUT"
  | "ADJUSTMENT"
  | "DELIVERY_RECEIVED"
  | "SALE"
  | "RETURN"
  | "VOID"
  // Repack / break-bulk: a source item is consumed (REPACK_OUT) to produce one
  // or more target items (REPACK_IN). The two sides share a referenceId so the
  // conversion is auditable end-to-end.
  | "REPACK_OUT"
  | "REPACK_IN";

export type OutletStockSource = "BODEGA" | "GROCERY";
export type OutletStockChannel = "WEB" | "FLUTTER" | "SYSTEM";

export interface IOutletStockTransaction extends Document {
  _id: Types.ObjectId;
  outletId: Types.ObjectId;
  outletInventoryId: Types.ObjectId;
  productSource: OutletStockSource;
  productId: Types.ObjectId;
  productName: string;
  transactionDate: Date;
  type: OutletStockTransactionType;
  quantity: number;
  unitCost: number;
  entryUnit: "PCS" | "PACK" | "QTY" | "KG" | "BAG";
  entryQty: number;
  multiplier: number;
  baseUnit: "PCS" | "KG" | "QTY";
  previousStock: number;
  newStock: number;
  referenceType?: string;
  referenceId?: Types.ObjectId;
  sourceChannel: OutletStockChannel;
  // Client-supplied dedupe key for repack/stock-in retries. The partial unique
  // index below is the real guard against a double-tap or retried request
  // moving stock twice (same mechanism as Sale.idempotencyKey).
  idempotencyKey?: string;
  remarks?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OutletStockTransactionSchema = new Schema<IOutletStockTransaction>(
  {
    outletId: {
      type: Schema.Types.ObjectId,
      ref: "Outlet",
      required: true,
    },

    outletInventoryId: {
      type: Schema.Types.ObjectId,
      ref: "OutletInventory",
      required: true,
    },

    productSource: {
      type: String,
      enum: ["BODEGA", "GROCERY"],
      required: true,
    },

    productId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
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
        "ADJUSTMENT",
        "DELIVERY_RECEIVED",
        "SALE",
        "RETURN",
        "VOID",
        "REPACK_OUT",
        "REPACK_IN",
      ],
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    // Cost per deducted base unit at transaction time.
    unitCost: {
      type: Number,
      default: 0,
      min: 0,
    },

    entryUnit: {
      type: String,
      enum: ["PCS", "PACK", "QTY", "KG", "BAG"],
      default: "QTY",
    },

    entryQty: {
      type: Number,
      default: 0,
      min: 0,
    },

    multiplier: {
      type: Number,
      default: 1,
      min: 1,
    },

    baseUnit: {
      type: String,
      enum: ["PCS", "KG", "QTY"],
      default: "QTY",
    },

    // No `min: 0` on the stock snapshots: OutletInventory.stockQty is allowed
    // to go negative (a POS never blocks the counter on an out-of-sync count),
    // and the ledger must record the TRUE before/after values or
    // newStock - previousStock stops equalling quantity — breaking every
    // reconciliation exactly in the negative-stock cases that need auditing.
    previousStock: {
      type: Number,
      required: true,
    },

    newStock: {
      type: Number,
      required: true,
    },

    referenceType: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    referenceId: {
      type: Schema.Types.ObjectId,
    },

    sourceChannel: {
      type: String,
      enum: ["WEB", "FLUTTER", "SYSTEM"],
      default: "WEB",
      required: true,
    },

    idempotencyKey: {
      type: String,
      trim: true,
    },

    remarks: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
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

OutletStockTransactionSchema.index({ outletId: 1, transactionDate: -1 });
OutletStockTransactionSchema.index({ outletInventoryId: 1, transactionDate: -1 });
OutletStockTransactionSchema.index({ productSource: 1 });
OutletStockTransactionSchema.index({ type: 1 });
OutletStockTransactionSchema.index({ referenceType: 1, referenceId: 1 });
// One ledger write per (outlet, idempotencyKey): a concurrent retry of the
// same repack/stock-in hits E11000 inside its transaction and rolls back,
// instead of moving stock twice. Partial so rows without a key are unaffected.
OutletStockTransactionSchema.index(
  { outletId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $exists: true } },
  }
);

const OutletStockTransactionModel: Model<IOutletStockTransaction> =
  mongoose.models.OutletStockTransaction ||
  mongoose.model<IOutletStockTransaction>(
    "OutletStockTransaction",
    OutletStockTransactionSchema
  );

export default OutletStockTransactionModel;
