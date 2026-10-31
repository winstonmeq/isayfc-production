// models/StockTransferItem.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

/**
 * One product line on a stock transfer.
 *
 * Item status (set at outlet confirmation):
 *   PENDING  — not yet confirmed by the outlet
 *   ACCEPTED — full quantity received (receivedQty === qty)
 *   PARTIAL  — some quantity received (0 < receivedQty < qty)
 *   REJECTED — nothing accepted (receivedQty === 0)
 */
export type StockTransferItemStatus =
  | "PENDING"
  | "ACCEPTED"
  | "PARTIAL"
  | "REJECTED";

export interface IStockTransferItem extends Document {
  _id: Types.ObjectId;
  transferId: Types.ObjectId;
  source: "BODEGA" | "GROCERY";
  bodegaProductId?: Types.ObjectId;
  productId?: Types.ObjectId;
  standardPackingId?: Types.ObjectId;

  // Snapshots at dispatch time so history stays correct if the product changes.
  productName: string;
  categoryName?: string;
  packSize: number;
  unitLabel: "PACK" | "HEAD" | "PCS" | "QTY";
  buyingPrice: number;
  // Internal transfer price charged to the outlet. This is the main product's
  // marked-up selling price at dispatch and becomes the outlet's acquisition
  // cost when received. It is not consolidated company revenue.
  sellingPrice: number;
  companyUnitCost?: number;

  // qty is what the user enters (packs for pack products, otherwise pieces/qty).
  // qtyPcs is the true base-unit quantity moved in stock = qty * (packSize||1).
  qty: number;
  qtyPcs: number;
  baseUnit?: "HEAD" | "PCS" | "QTY";
  baseQty?: number;
  receivedQty: number;
  receivedPcs: number;
  varianceQty: number;
  itemStatus: StockTransferItemStatus;
  remarks?: string;

  createdAt: Date;
  updatedAt: Date;
}

const StockTransferItemSchema = new Schema<IStockTransferItem>(
  {
    transferId: {
      type: Schema.Types.ObjectId,
      ref: "StockTransfer",
      required: true,
    },

    source: {
      type: String,
      enum: ["BODEGA", "GROCERY"],
      default: "BODEGA",
      required: true,
    },

    bodegaProductId: {
      type: Schema.Types.ObjectId,
      ref: "BodegaProduct",
    },

    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },

    standardPackingId: {
      type: Schema.Types.ObjectId,
      ref: "StandardPacking",
    },

    productName: {
      type: String,
      required: true,
      trim: true,
    },

    categoryName: {
      type: String,
      trim: true,
      default: "",
    },

    packSize: {
      type: Number,
      default: 0,
      min: 0,
    },

    unitLabel: {
      type: String,
      enum: ["PACK", "HEAD", "PCS", "QTY"],
      default: "PCS",
    },

    buyingPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    sellingPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    companyUnitCost: { type: Number, min: 0 },

    qty: {
      type: Number,
      required: true,
      min: 1,
    },

    qtyPcs: {
      type: Number,
      required: true,
      min: 1,
    },

    // Explicit unit snapshot for new records. qtyPcs remains for compatibility
    // with existing transfers, but baseQty is the authoritative moved amount.
    baseUnit: {
      type: String,
      enum: ["HEAD", "PCS", "QTY"],
    },

    baseQty: {
      type: Number,
      min: 0,
    },

    receivedQty: {
      type: Number,
      default: 0,
      min: 0,
    },

    receivedPcs: {
      type: Number,
      default: 0,
      min: 0,
    },

    varianceQty: {
      type: Number,
      default: 0,
      min: 0,
    },

    itemStatus: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "PARTIAL", "REJECTED"],
      default: "PENDING",
      required: true,
    },

    remarks: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

StockTransferItemSchema.index({ transferId: 1 });
StockTransferItemSchema.index({ bodegaProductId: 1 });
StockTransferItemSchema.index({ productId: 1 });
StockTransferItemSchema.index({ standardPackingId: 1 });

const StockTransferItemModel: Model<IStockTransferItem> =
  mongoose.models.StockTransferItem ||
  mongoose.model<IStockTransferItem>(
    "StockTransferItem",
    StockTransferItemSchema
  );

export default StockTransferItemModel;
