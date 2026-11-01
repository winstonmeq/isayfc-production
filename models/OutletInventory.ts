// models/OutletInventory.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type OutletInventorySource = "BODEGA" | "GROCERY";
export type OutletInventoryOrigin = "TRANSFER" | "OUTLET_PRODUCTION" | "OUTSIDE_PURCHASE";
export type OutletInventoryUnit = "HEAD" | "PCS" | "PACK" | "QTY" | "KG" | "BAG";

export interface IOutletInventory extends Document {
  _id: Types.ObjectId;
  outletId: Types.ObjectId;
  productSource: OutletInventorySource;
  originType: OutletInventoryOrigin;
  productId: Types.ObjectId;
  productName: string;
  unitCode?: string;
  categoryName?: string;
  stockQty: number;
  companyUnitCost?: number;
  unitLabel: OutletInventoryUnit;
  packSize: number;
  lowStockAlert: number;
  buyingPrice: number;
  sellingPrice: number;
  remarks?: string;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OutletInventorySchema = new Schema<IOutletInventory>(
  {
    outletId: {
      type: Schema.Types.ObjectId,
      ref: "Outlet",
      required: true,
    },

    productSource: {
      type: String,
      enum: ["BODEGA", "GROCERY"],
      required: true,
    },

    // `productSource` preserves ingredient/cost lineage. `originType` tells
    // users whether this stock was received or manufactured at the outlet.
    originType: {
      type: String,
      enum: ["TRANSFER", "OUTLET_PRODUCTION", "OUTSIDE_PURCHASE"],
      default: "TRANSFER",
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

    unitCode: { type: String, trim: true, uppercase: true },
    categoryName: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    // No `min: 0`. The mobile POS intentionally allows stock to go negative so
    // a cashier is never blocked mid-sale by an out-of-sync count; the shortfall
    // is surfaced as a warning and reconciled later. A `min: 0` here would make
    // that save throw inside the sale transaction and roll back the whole sale.
    stockQty: {
      type: Number,
      default: 0,
    },

    unitLabel: {
      type: String,
      enum: ["HEAD", "PCS", "PACK", "QTY", "KG", "BAG"],
      default: "QTY",
      required: true,
    },

    packSize: {
      type: Number,
      default: 0,
      min: 0,
    },

    lowStockAlert: {
      type: Number,
      default: 0,
      min: 0,
    },

    buyingPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Original company cost per base unit, excluding internal markup.
    companyUnitCost: { type: Number, min: 0 },

    sellingPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    remarks: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

OutletInventorySchema.index(
  { outletId: 1, productSource: 1, productId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);
OutletInventorySchema.index({ outletId: 1 });
OutletInventorySchema.index({ productSource: 1 });
OutletInventorySchema.index({ productName: 1 });
OutletInventorySchema.index({ isActive: 1 });

const OutletInventoryModel: Model<IOutletInventory> =
  mongoose.models.OutletInventory ||
  mongoose.model<IOutletInventory>("OutletInventory", OutletInventorySchema);

export default OutletInventoryModel;
