import mongoose, { Schema } from "mongoose";

const employeeSchema = new Schema({
  outletId: { type: Schema.Types.ObjectId, required: true, index: true },
  name: { type: String, required: true, trim: true, uppercase: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, required: true },
}, { timestamps: true });
employeeSchema.index({ outletId: 1, name: 1 }, { unique: true });

const purchaseSchema = new Schema({
  outletId: { type: Schema.Types.ObjectId, required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, required: true },
  employeeName: { type: String, required: true },
  inventoryId: { type: Schema.Types.ObjectId, required: true },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  reimbursed: { type: Number, default: 0, min: 0 },
  purchaseDate: { type: Date, required: true },
  supplier: { type: String, required: true },
  receipt: { type: String, required: true },
  remarks: String,
  requestKey: { type: String, required: true },
  requestHash: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, required: true },
}, { timestamps: true });
purchaseSchema.index({ outletId: 1, requestKey: 1 }, { unique: true });

const cashSchema = new Schema({
  outletId: { type: Schema.Types.ObjectId, required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, required: true },
  employeeName: { type: String, required: true },
  kind: { type: String, enum: ["EMPLOYEE_COLLECTION", "EMPLOYEE_REIMBURSEMENT"], required: true },
  referenceId: { type: Schema.Types.ObjectId, required: true },
  amount: { type: Number, required: true, min: 0 },
  businessDate: { type: Date, required: true, index: true },
  requestKey: { type: String, required: true },
  requestHash: { type: String, required: true },
  remarks: String,
  createdBy: { type: Schema.Types.ObjectId, required: true },
}, { timestamps: true });
cashSchema.set("collection", "outletemployeecashmovements");
cashSchema.index({ outletId: 1, requestKey: 1 }, { unique: true });

export const OutletEmployee = mongoose.models.OutletEmployee || mongoose.model("OutletEmployee", employeeSchema);
export const OutletEmployeePurchase = mongoose.models.OutletEmployeePurchase || mongoose.model("OutletEmployeePurchase", purchaseSchema);
export const OutletEmployeeCash = mongoose.models.OutletEmployeeCash || mongoose.model("OutletEmployeeCash", cashSchema);
