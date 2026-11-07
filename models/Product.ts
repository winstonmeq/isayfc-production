// models/Product.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";
import { PRODUCT_USAGES, type ProductUsage } from "@/lib/product-usage";

export interface IProduct extends Document {
  _id: Types.ObjectId;
  name: string;
  unitCode?: string;
  usage?: ProductUsage;
  categoryId: Types.ObjectId;
  buyingPrice: number;
  unitPrice: number;
  lastPurchaseCost?: number;
  priceReviewRequired?: boolean;
  priceReviewToken?: string;
  priceReviewPreviousCost?: number;
  priceReviewRequestedAt?: Date;
  stockPcs: number;
  stockBags: number;
  stockKilos: number;
  lowStockAlert: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
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
      required: true,
    },
    unitCode: { type: String, trim: true, uppercase: true, default: "PCS", index: true },
    lastPurchaseCost: { type: Number, min: 0 },
    priceReviewRequired: { type: Boolean, default: false, index: true },
    priceReviewToken: String,
    priceReviewPreviousCost: Number,
    priceReviewRequestedAt: Date,
    usage: { type: String, enum: PRODUCT_USAGES, default: "UNASSIGNED" },

    buyingPrice: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    unitPrice: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    stockPcs: {
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

    lowStockAlert: {
      type: Number,
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

ProductSchema.index({ name: 1 });
ProductSchema.index({ categoryId: 1 });
ProductSchema.index({ isActive: 1 });
ProductSchema.index({ usage: 1 });

if (mongoose.models.Product && !mongoose.models.Product.schema.path("usage")) mongoose.models.Product.schema.add({ usage: { type: String, enum: PRODUCT_USAGES, default: "UNASSIGNED" } });

if (mongoose.models.Product && !mongoose.models.Product.schema.path("priceReviewRequired")) mongoose.deleteModel("Product");

const ProductModel: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>("Product", ProductSchema);

export default ProductModel;
