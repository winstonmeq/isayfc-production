// models/Customer.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type CustomerType = "SALE" | "DELIVERY" | "BOTH";

export interface ICustomer extends Document {
  _id: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  outletId?: Types.ObjectId;
  type: CustomerType;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    address: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    outletId: {
      type: Schema.Types.ObjectId,
      ref: "Outlet",
      required: false,
    },

    type: {
      type: String,
      enum: ["SALE", "DELIVERY", "BOTH"],
      default: "SALE",
    },

    isActive: {
      type: Boolean,
      default: true,
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

CustomerSchema.index({ name: 1 });
CustomerSchema.index({ type: 1 });
CustomerSchema.index({ outletId: 1 }, { unique: true, sparse: true });
CustomerSchema.index({ isActive: 1 });

const CustomerModel: Model<ICustomer> =
  mongoose.models.Customer ||
  mongoose.model<ICustomer>("Customer", CustomerSchema);

export default CustomerModel;
