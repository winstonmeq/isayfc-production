import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type CustomerInventoryTransactionType = "DELIVERY_IN" | "ADJUSTMENT";

export interface ICustomerInventoryTransaction extends Document {
  _id: Types.ObjectId;
  customerInventoryId: Types.ObjectId;
  customerId: Types.ObjectId;
  transactionDate: Date;
  type: CustomerInventoryTransactionType;
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceType?: string;
  referenceId?: Types.ObjectId;
  remarks?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerInventoryTransactionSchema = new Schema<ICustomerInventoryTransaction>(
  {
    customerInventoryId: {
      type: Schema.Types.ObjectId,
      ref: "CustomerInventory",
      required: true,
    },

    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    transactionDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    type: {
      type: String,
      enum: ["DELIVERY_IN", "ADJUSTMENT"],
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    previousStock: {
      type: Number,
      required: true,
    },

    newStock: {
      type: Number,
      required: true,
    },

    referenceType: {
      type: String,
      default: "",
      trim: true,
    },

    referenceId: {
      type: Schema.Types.ObjectId,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

CustomerInventoryTransactionSchema.index({ customerInventoryId: 1 });
CustomerInventoryTransactionSchema.index({ customerId: 1 });
CustomerInventoryTransactionSchema.index({ createdAt: -1 });
CustomerInventoryTransactionSchema.index({ transactionDate: -1 });

const CustomerInventoryTransactionModel: Model<ICustomerInventoryTransaction> =
  mongoose.models.CustomerInventoryTransaction ||
  mongoose.model<ICustomerInventoryTransaction>(
    "CustomerInventoryTransaction",
    CustomerInventoryTransactionSchema
  );

export default CustomerInventoryTransactionModel;
