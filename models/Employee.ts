import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  code: { type: String, required: true, trim: true, uppercase: true, unique: true },
  name: { type: String, required: true, trim: true, uppercase: true },
  customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, unique: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

export default mongoose.models.Employee || mongoose.model("Employee", schema);
