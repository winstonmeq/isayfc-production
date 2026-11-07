// models/BodegaProduct.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";
import { PRODUCT_USAGES, type ProductUsage } from "@/lib/product-usage";

export interface IBodegaProduct extends Document {
  _id: Types.ObjectId;
  name: string;
  unitCode?: string;
  usage?: ProductUsage;
  categoryId?: Types.ObjectId;
  stockQty: number;
  stockBags: number;
  stockKilos: number;
  stockHeads: number;
  buyingPrice: number;
  sellingPrice: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BodegaProductSchema = new Schema<IBodegaProduct>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
    },

    unitCode: { type: String, trim: true, uppercase: true, index: true },
    usage: { type: String, enum: PRODUCT_USAGES, default: "UNASSIGNED" },
    stockQty: {
      type: Number,
      default: 0,
      min: 0,
    },

    stockBags: {
      type: Number,
      default: 0,
      min: 0,
    },

    stockKilos: {
      type: Number,
      default: 0,
      min: 0,
    },

    stockHeads: {
      type: Number,
      default: 0,
      min: 0,
    },

    buyingPrice: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    sellingPrice: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

BodegaProductSchema.index({ name: 1 });
BodegaProductSchema.index({ categoryId: 1 });
BodegaProductSchema.index({ isActive: 1 });
BodegaProductSchema.index({ usage: 1 });

if (mongoose.models.BodegaProduct && !mongoose.models.BodegaProduct.schema.path("usage")) mongoose.models.BodegaProduct.schema.add({ usage: { type: String, enum: PRODUCT_USAGES, default: "UNASSIGNED" } });

const BodegaProductModel: Model<IBodegaProduct> =
  mongoose.models.BodegaProduct ||
  mongoose.model<IBodegaProduct>("BodegaProduct", BodegaProductSchema);

export default BodegaProductModel;
