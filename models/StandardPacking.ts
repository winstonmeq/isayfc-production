// models/StandardPacking.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IStandardPacking extends Document {
  _id: Types.ObjectId;
  wholeChickenId: Types.ObjectId;
  productId: Types.ObjectId;
  standardPacking: number;
  minimumKilos: number;
  maximumKilos: number;
  standardSlice: number;
  chickenSizeType?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StandardPackingSchema = new Schema<IStandardPacking>(
  {
    wholeChickenId: {
      type: Schema.Types.ObjectId,
      ref: "BodegaProduct",
      required: true,
    },

    productId: {
      type: Schema.Types.ObjectId,
      ref: "BodegaProduct",
      required: true,
    },

    standardPacking: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    minimumKilos: {
      type: Number,
      default: 0,
      min: 0,
    },

    maximumKilos: {
      type: Number,
      default: 0,
      min: 0,
    },

    standardSlice: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    chickenSizeType: {
      type: String,
      default: "",
      trim: true,
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

StandardPackingSchema.index({ wholeChickenId: 1 });
StandardPackingSchema.index({ productId: 1 });
StandardPackingSchema.index({ isActive: 1 });

const StandardPackingModel: Model<IStandardPacking> =
  mongoose.models.StandardPacking ||
  mongoose.model<IStandardPacking>("StandardPacking", StandardPackingSchema);

export default StandardPackingModel;
