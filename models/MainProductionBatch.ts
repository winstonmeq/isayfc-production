import mongoose, { Schema } from "mongoose";

const ingredient = new Schema({
  inventoryType: { type: String, enum: ["BODEGA", "GROCERY"], required: true },
  inventoryId: { type: Schema.Types.ObjectId, required: true }, productName: String, unit: String,
  quantity: Number, kilos: Number, unitCost: Number, costMultiplier: Number, cost: Number,
  previousQty: Number, newQty: Number, previousKilos: Number, newKilos: Number,
}, { _id: false });
const schema = new Schema({
  requestKey: { type: String, required: true, unique: true }, payloadHash: { type: String, required: true },
  batchNumber: { type: String, required: true, unique: true }, productionDate: { type: Date, required: true },
  outputProductId: { type: Schema.Types.ObjectId, required: true }, outputName: String,
  outputType: { type: String, enum: ["BODEGA", "GROCERY"], default: "GROCERY" },
  outputBefore: Number, outputAfter: Number, outputPreviousCost: Number,
  allocatedExpenses: [{ expenseId: { type: Schema.Types.ObjectId, ref: "Expense" }, name: String, amount: Number }],
  outputKilos: Number, totalCost: Number, costPerKilo: Number, weightedCost: Number,
  ingredients: [ingredient], remarks: String,
  status: { type: String, enum: ["POSTED", "REVERSED"], default: "POSTED" },
  reversedAt: Date, reversedBy: { type: Schema.Types.ObjectId, ref: "User" }, reversalReason: String,
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
schema.index({ productionDate: -1 });
if (mongoose.models.MainProductionBatch && !mongoose.models.MainProductionBatch.schema.path("allocatedExpenses")) mongoose.deleteModel("MainProductionBatch");
export default mongoose.models.MainProductionBatch || mongoose.model("MainProductionBatch", schema);
