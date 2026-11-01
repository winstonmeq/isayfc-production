// models/User.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type UserRole = "ADMIN" | "MANAGER" | "CASHIER" | "STAFF" | "USER";

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  roleId?: Types.ObjectId;
  outletId?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },

    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      default: "",
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["ADMIN", "MANAGER", "CASHIER", "STAFF", "USER"],
      default: "USER",
      required: true,
    },

    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
    },

    outletId: {
      type: Schema.Types.ObjectId,
      ref: "Outlet",
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

// username.unique already declares this unique index; do not declare it twice.
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ roleId: 1 });
UserSchema.index({ outletId: 1 });
UserSchema.index({ isActive: 1 });

const UserModel: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default UserModel;
