// models/Product.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IProduct extends Document {
  _id: Types.ObjectId;
  name: string;
  unitCode?: string;
  categoryId: Types.ObjectId;
  buyingPrice: number;
  unitPrice: number;
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

const ProductModel: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>("Product", ProductSchema);

export default ProductModel;
