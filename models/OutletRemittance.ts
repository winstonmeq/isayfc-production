import mongoose, { Schema } from "mongoose";
const schema = new Schema({
  outletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true, index: true },
  businessDate: { type: Date, required: true },
  amount: { type: Number, required: true, min: 0.01 },
  reference: { type: String, required: true, trim: true },
  remarks: { type: String, trim: true },
  requestKey: { type: String, required: true },
  requestHash: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
schema.index({ outletId: 1, requestKey: 1 }, { unique: true });
export default mongoose.models.OutletRemittance || mongoose.model("OutletRemittance", schema);
