// models/CashShift.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

/**
 * A cashier's cash drawer session at an outlet.
 *
 * open:  cashier records the starting cash float (openingFloat).
 * close: cashier counts the drawer (countedCash). The system computes
 *        expectedCash = openingFloat + cashSales - cashExpenses, and the
 *        variance = countedCash - expectedCash (positive = over, negative = short).
 *
 * Only one OPEN shift per cashier at a time.
 */
export interface ICashShift extends Document {
  _id: Types.ObjectId;
  outletId: Types.ObjectId;
  cashierId: Types.ObjectId;
  cashierName: string;
  status: "OPEN" | "CLOSED";

  openingFloat: number;
  openedAt: Date;

  // Filled at close:
  cashSales: number; // sum of cash sales during the shift
  cashExpenses: number; // sum of cash expenses during the shift
  salesCount: number;
  expectedCash: number; // openingFloat + cashSales - cashExpenses
  countedCash: number; // what the cashier physically counted
  variance: number; // countedCash - expectedCash
  closedAt?: Date;

  openRemarks?: string;
  closeRemarks?: string;

  createdAt: Date;
  updatedAt: Date;
}

const CashShiftSchema = new Schema<ICashShift>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    cashierId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    cashierName: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
      required: true,
    },

    openingFloat: { type: Number, default: 0, min: 0 },
    openedAt: { type: Date, default: Date.now },

    cashSales: { type: Number, default: 0 },
    cashExpenses: { type: Number, default: 0 },
    salesCount: { type: Number, default: 0 },
    expectedCash: { type: Number, default: 0 },
    countedCash: { type: Number, default: 0 },
    variance: { type: Number, default: 0 },
    closedAt: { type: Date },

    openRemarks: { type: String, default: "", trim: true },
    closeRemarks: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

// Fast lookup of a cashier's current open shift.
CashShiftSchema.index({ cashierId: 1, status: 1 });
CashShiftSchema.index({ outletId: 1, status: 1 });
CashShiftSchema.index({ openedAt: -1 });
// Enforce at most one OPEN shift per cashier at the database level, so a
// double-tap on "Open" can't create two concurrent open shifts (the route's
// read-then-create check alone is racy).
CashShiftSchema.index(
  { cashierId: 1 },
  { unique: true, partialFilterExpression: { status: "OPEN" } }
);

const CashShiftModel: Model<ICashShift> =
  mongoose.models.CashShift ||
  mongoose.model<ICashShift>("CashShift", CashShiftSchema);

export default CashShiftModel;
