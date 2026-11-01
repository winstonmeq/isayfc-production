// models/Expense.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type ExpenseCategory = "GROCERY" | "BODEGA" | "OUTLET";

export type ExpenseType = string;

export interface IExpense extends Document {
  _id: Types.ObjectId;
  name: string;
  expenseCategory: ExpenseCategory;
  type: ExpenseType;
  expenseDate: Date;
  amount: number;
  origin?: "MANUAL" | "OWNER_OUTLET_DELIVERY";
  linkedTransferId?: Types.ObjectId;
  linkedSaleId?: Types.ObjectId;
  beneficiaryOutletId?: Types.ObjectId;
  // First-class outlet/shift links for mobile expenses (previously only in
  // `remarks` as "OUTLET:<id> SHIFT:<id>"). Old rows fall back to the tag.
  outletId?: Types.ObjectId;
  shiftId?: Types.ObjectId;
  remarks?: string;
  createdBy?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const expenseCategoryValues: ExpenseCategory[] = ["GROCERY", "BODEGA", "OUTLET"];

const ExpenseSchema = new Schema<IExpense>(
  {
    origin: { type: String, enum: ["MANUAL", "OWNER_OUTLET_DELIVERY"], default: "MANUAL", index: true },
    linkedTransferId: { type: Schema.Types.ObjectId, ref: "StockTransfer", index: true },
    linkedSaleId: { type: Schema.Types.ObjectId, ref: "Sale" },
    beneficiaryOutletId: { type: Schema.Types.ObjectId, ref: "Outlet" },
    name: {
      type: String,
      required: true,
      trim: true,
    },

    expenseCategory: {
      type: String,
      enum: expenseCategoryValues,
      default: "BODEGA",
      required: true,
    },

    type: {
      type: String,
      default: "OTHERS",
      required: true,
      trim: true,
      uppercase: true,
    },

    expenseDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    outletId: {
      type: Schema.Types.ObjectId,
      ref: "Outlet",
      required: false,
    },

    shiftId: {
      type: Schema.Types.ObjectId,
      ref: "CashShift",
      required: false,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

ExpenseSchema.index({ name: 1 });
ExpenseSchema.index({ expenseCategory: 1 });
ExpenseSchema.index({ type: 1 });
ExpenseSchema.index({ expenseDate: -1 });
ExpenseSchema.index({ isActive: 1 });
ExpenseSchema.index({ shiftId: 1 });
ExpenseSchema.index({ outletId: 1, expenseDate: -1 });

const ExpenseModel: Model<IExpense> =
  mongoose.models.Expense || mongoose.model<IExpense>("Expense", ExpenseSchema);

export default ExpenseModel;
