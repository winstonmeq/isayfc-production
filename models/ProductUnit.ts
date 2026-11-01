import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";
const schema = new Schema({
  code: { type: String, required: true, uppercase: true, trim: true, unique: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  allowsDecimal: { type: Boolean, required: true, default: false },
  isSystem: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
export type ProductUnitRecord = InferSchemaType<typeof schema>;
export default (mongoose.models.ProductUnit || mongoose.model("ProductUnit", schema)) as Model<ProductUnitRecord>;
