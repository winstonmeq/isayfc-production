import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IInventoryAdjustment extends Document {
  _id: Types.ObjectId;
  adjustmentNumber: string;
  adjustmentDate: Date;
  inventoryType: "BODEGA" | "GROCERY" | "OUTLET";
  inventoryId: Types.ObjectId;
  productName: string;
  unit: string;
  previousQty: number;
  adjustedQty: number;
  newQty: number;
  reason: string;
  remarks?: string;
  stockCountId?: Types.ObjectId;
  status?: "POSTED" | "REVERSED";
  reversalOf?: Types.ObjectId;
  reversedByAdjustmentId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryAdjustmentSchema = new Schema<IInventoryAdjustment>({
  adjustmentNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
  adjustmentDate: { type: Date, required: true, default: Date.now },
  inventoryType: { type: String, enum: ["BODEGA", "GROCERY", "OUTLET"], required: true },
  inventoryId: { type: Schema.Types.ObjectId, required: true },
  productName: { type: String, required: true, trim: true, uppercase: true },
  unit: { type: String, required: true, trim: true, uppercase: true },
  previousQty: { type: Number, required: true },
  adjustedQty: { type: Number, required: true },
  newQty: { type: Number, required: true },
  reason: { type: String, required: true, trim: true, uppercase: true },
  remarks: { type: String, default: "", trim: true, uppercase: true },
  stockCountId: { type: Schema.Types.ObjectId, ref: "StockCount" },
  status: { type: String, enum: ["POSTED", "REVERSED"], default: "POSTED" },
  reversalOf: { type: Schema.Types.ObjectId, ref: "InventoryAdjustment" },
  reversedByAdjustmentId: { type: Schema.Types.ObjectId, ref: "InventoryAdjustment" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

InventoryAdjustmentSchema.index({ adjustmentDate: -1, inventoryType: 1 });
InventoryAdjustmentSchema.index({ inventoryId: 1 });
InventoryAdjustmentSchema.index({ reversalOf: 1 }, { unique: true, sparse: true });
const InventoryAdjustmentModel: Model<IInventoryAdjustment> = mongoose.models.InventoryAdjustment || mongoose.model<IInventoryAdjustment>("InventoryAdjustment", InventoryAdjustmentSchema);
export default InventoryAdjustmentModel;
