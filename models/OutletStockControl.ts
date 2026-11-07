import mongoose, { Schema } from "mongoose";

// Immutable stock-control documents; returns remain requests until their
// accounting/receiving workflow has been approved and posted.
const schema = new Schema({
  outletId: { type: Schema.Types.ObjectId, required: true, index: true },
  inventoryId: { type: Schema.Types.ObjectId, required: true },
  productName: { type: String, required: true },
  kind: { type: String, enum: ["CORRECTION", "SPOILAGE", "CUSTOMER_RETURN", "RETURN_TO_MAIN"], required: true },
  status: { type: String, enum: ["POSTED", "PENDING_REVIEW"], required: true },
  quantity: { type: Number, required: true },
  previousStock: Number,
  newStock: Number,
  unit: String,
  unitCost: Number,
  amount: Number,
  reason: { type: String, required: true },
  saleLineId: Schema.Types.ObjectId,
  createdBy: { type: Schema.Types.ObjectId, required: true },
  requestHash: { type: String, required: true },
}, { timestamps: true });
export default mongoose.models.OutletStockControl || mongoose.model("OutletStockControl", schema);
