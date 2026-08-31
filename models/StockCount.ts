import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type StockCountInventory = "BODEGA" | "GROCERY" | "OUTLET";
export type StockCountStatus = "DRAFT" | "POSTED" | "CANCELLED";

export interface IStockCountItem {
  inventoryType: StockCountInventory;
  inventoryId: Types.ObjectId;
  productName: string;
  unit: string;
  systemQty: number;
  countedQty: number;
  variance: number;
}

export interface IStockCount extends Document {
  _id: Types.ObjectId;
  countNumber: string;
  countDate: Date;
  status: StockCountStatus;
  outletId?: Types.ObjectId;
  remarks?: string;
  items: IStockCountItem[];
  createdBy?: Types.ObjectId;
  postedBy?: Types.ObjectId;
  postedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StockCountItemSchema = new Schema<IStockCountItem>({
  inventoryType: { type: String, enum: ["BODEGA", "GROCERY", "OUTLET"], required: true },
  inventoryId: { type: Schema.Types.ObjectId, required: true },
  productName: { type: String, required: true, trim: true, uppercase: true },
  unit: { type: String, required: true, trim: true, uppercase: true },
  systemQty: { type: Number, required: true },
  countedQty: { type: Number, required: true },
  variance: { type: Number, required: true },
}, { _id: false });

const StockCountSchema = new Schema<IStockCount>({
  countNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
  countDate: { type: Date, required: true, default: Date.now },
  status: { type: String, enum: ["DRAFT", "POSTED", "CANCELLED"], default: "DRAFT" },
  outletId: { type: Schema.Types.ObjectId, ref: "Outlet" },
  remarks: { type: String, default: "", trim: true, uppercase: true },
  items: { type: [StockCountItemSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  postedBy: { type: Schema.Types.ObjectId, ref: "User" },
  postedAt: Date,
}, { timestamps: true });

StockCountSchema.index({ countDate: -1, status: 1 });
const StockCountModel: Model<IStockCount> = mongoose.models.StockCount || mongoose.model<IStockCount>("StockCount", StockCountSchema);
export default StockCountModel;
