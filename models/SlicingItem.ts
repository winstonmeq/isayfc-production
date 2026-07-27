import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface ISlicingItem extends Document {
  _id: Types.ObjectId;
  batchId: Types.ObjectId;
  standardId: Types.ObjectId;
  mainProductId: Types.ObjectId;
  slicedProductId: Types.ObjectId;
  mainProductName: string;
  slicedProductName: string;
  bags: number;
  heads: number;
  kilos: number;
  minimumKilos: number;
  maximumKilos: number;
  standardSlice: number;
  standardPacking: number;
  totalStdPcs: number;
  actualSlicedPcs: number;
  actualPacks: number;
  butal: number;
  variance: number;
  inputUnitCost: number;
  outputUnitPrice: number;
  inputCost: number;
  outputValue: number;
  varianceValue: number;
  recoveryProfit: number;
  recoveryRate: number;
  yieldRate: number;
  createdAt: Date;
  updatedAt: Date;
}

const SlicingItemSchema = new Schema<ISlicingItem>(
  {
    batchId: {
      type: Schema.Types.ObjectId,
      ref: "SlicingBatch",
      required: true,
    },
    // This points to models/StandardPacking.ts, not an old SlicingStandard model.
    standardId: {
      type: Schema.Types.ObjectId,
      ref: "StandardPacking",
      required: true,
    },
    // Slicing now uses bodega products for both input whole chicken and output sliced product.
    mainProductId: {
      type: Schema.Types.ObjectId,
      ref: "BodegaProduct",
      required: true,
    },
    slicedProductId: {
      type: Schema.Types.ObjectId,
      ref: "BodegaProduct",
      required: true,
    },
    mainProductName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    slicedProductName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    bags: {
      type: Number,
      default: 0,
      min: 0,
    },
    heads: {
      type: Number,
      default: 0,
      min: 0,
    },
    kilos: {
      type: Number,
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
      min: 0,
    },
    standardPacking: {
      type: Number,
      required: true,
      min: 0,
    },
    totalStdPcs: {
      type: Number,
      default: 0,
      min: 0,
    },
    actualSlicedPcs: {
      type: Number,
      default: 0,
      min: 0,
    },
    actualPacks: {
      type: Number,
      default: 0,
      min: 0,
    },
    butal: {
      type: Number,
      default: 0,
      min: 0,
    },
    variance: {
      type: Number,
      default: 0,
    },
    inputUnitCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    outputUnitPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    inputCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    outputValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    varianceValue: {
      type: Number,
      default: 0,
    },
    recoveryProfit: {
      type: Number,
      default: 0,
    },
    recoveryRate: {
      type: Number,
      default: 0,
    },
    yieldRate: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

SlicingItemSchema.index({ batchId: 1 });
SlicingItemSchema.index({ standardId: 1 });
SlicingItemSchema.index({ mainProductId: 1 });
SlicingItemSchema.index({ slicedProductId: 1 });
SlicingItemSchema.index({ batchId: 1, slicedProductId: 1 });
SlicingItemSchema.index({ batchId: 1, mainProductId: 1 });

const SlicingItemModel: Model<ISlicingItem> =
  mongoose.models.SlicingItem ||
  mongoose.model<ISlicingItem>("SlicingItem", SlicingItemSchema);

export default SlicingItemModel;
