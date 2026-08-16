// models/SaleLine.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type SaleLineSource = "CHICKEN" | "BODEGA";
export type SaleStockUnit = "PACK" | "HEAD" | "QTY";

export interface ISaleLine extends Document {
  _id: Types.ObjectId;
  saleId: Types.ObjectId;
  source: SaleLineSource;

  productId?: Types.ObjectId;
  bodegaProductId?: Types.ObjectId;

  categoryId?: Types.ObjectId;
  categoryName: string;
  productName: string;

  qty: number;
  price: number;
  lineTotal: number;
  unitCost: number;

  stockUnit: SaleStockUnit;
  packSize: number;
  stockPcsOut: number;
  baseUnit?: "HEAD" | "PCS" | "QTY";
  baseQty?: number;
  entryUnit?: "HEAD" | "PACK" | "PCS" | "QTY";
  multiplier?: number;

  remarks?: string;

  createdAt: Date;
  updatedAt: Date;
}

const SaleLineSchema = new Schema<ISaleLine>(
  {
    saleId: {
      type: Schema.Types.ObjectId,
      ref: "Sale",
      required: true,
    },

    source: {
      type: String,
      enum: ["CHICKEN", "BODEGA"],
      required: true,
    },

    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },

    bodegaProductId: {
      type: Schema.Types.ObjectId,
      ref: "BodegaProduct",
    },

    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
    },

    categoryName: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    qty: {
      type: Number,
      required: true,
      min: 0,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },

    // Cost per base stock unit at the time of sale. Historical reports use
    // this snapshot instead of today's product price.
    unitCost: {
      type: Number,
      default: 0,
      min: 0,
    },

    stockUnit: {
      type: String,
      enum: ["PACK", "HEAD", "QTY"],
      required: true,
    },

    packSize: {
      type: Number,
      default: 0,
      min: 0,
    },

    stockPcsOut: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Explicit quantity snapshots for new sales. Legacy stockPcsOut remains
    // readable so historical reports do not require a destructive migration.
    baseUnit: {
      type: String,
      enum: ["HEAD", "PCS", "QTY"],
    },

    baseQty: {
      type: Number,
      min: 0,
    },

    entryUnit: {
      type: String,
      enum: ["HEAD", "PACK", "PCS", "QTY"],
    },

    multiplier: {
      type: Number,
      min: 1,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },
  },
  {
    timestamps: true,
  }
);

SaleLineSchema.index({ saleId: 1 });
SaleLineSchema.index({ source: 1 });
SaleLineSchema.index({ productId: 1 });
SaleLineSchema.index({ bodegaProductId: 1 });
SaleLineSchema.index({ categoryName: 1 });
SaleLineSchema.index({ productName: 1 });

const SaleLineModel: Model<ISaleLine> =
  mongoose.models.SaleLine ||
  mongoose.model<ISaleLine>("SaleLine", SaleLineSchema);

export default SaleLineModel;
