// models/Role.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IRole extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    permissions: {
      type: [String],
      default: [],
    },

    isSystem: {
      type: Boolean,
      default: false,
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

RoleSchema.index({ isActive: 1 });

const RoleModel: Model<IRole> =
  mongoose.models.Role || mongoose.model<IRole>("Role", RoleSchema);

export default RoleModel;
