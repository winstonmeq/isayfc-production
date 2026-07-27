// models/BodegaProduct.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IBodegaProduct extends Document {
  _id: Types.ObjectId;
  name: string;
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

const BodegaProductModel: Model<IBodegaProduct> =
  mongoose.models.BodegaProduct ||
  mongoose.model<IBodegaProduct>("BodegaProduct", BodegaProductSchema);

export default BodegaProductModel;
