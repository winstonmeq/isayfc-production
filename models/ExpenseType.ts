import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IExpenseType extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseTypeSchema = new Schema<IExpenseType>(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ExpenseTypeSchema.index({ code: 1 }, { unique: true });
ExpenseTypeSchema.index({ isActive: 1, name: 1 });

const ExpenseTypeModel: Model<IExpenseType> =
  mongoose.models.ExpenseType ||
  mongoose.model<IExpenseType>("ExpenseType", ExpenseTypeSchema);

export default ExpenseTypeModel;
