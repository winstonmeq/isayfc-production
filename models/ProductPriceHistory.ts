import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
  previousPrice: { type: Number, required: true },
  sellingPrice: { type: Number, required: true },
  buyingCost: { type: Number, required: true },
  latestPurchaseCost: Number,
  reason: { type: String, required: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
export default mongoose.models.ProductPriceHistory || mongoose.model("ProductPriceHistory", schema);
