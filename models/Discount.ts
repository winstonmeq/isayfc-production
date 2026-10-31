import mongoose, { type Document, type Model, Schema, type Types } from "mongoose";
import type { DiscountRule } from "@/lib/discounts";

export interface IDiscount extends Document, DiscountRule {
  _id: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DiscountSchema = new Schema<IDiscount>({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  type: { type: String, enum: ["PERCENTAGE", "AMOUNT"], required: true },
  value: { type: Number, required: true, min: 0.01 },
  basis: { type: String, enum: ["PER_UNIT", "PER_ROW"], default: "PER_ROW" },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
DiscountSchema.index({ isActive: 1, name: 1 });
const DiscountModel: Model<IDiscount> = mongoose.models.Discount || mongoose.model<IDiscount>("Discount", DiscountSchema);
export default DiscountModel;
