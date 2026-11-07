// models/Category.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";
import { CATEGORY_SOURCES, type CategorySource } from "@/lib/category-source";

export interface ICategory extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  source: CategorySource;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    description: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    source: { type: String, enum: [...CATEGORY_SOURCES], default: "SHARED", required: true },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

CategorySchema.index({ name: 1 });
CategorySchema.index({ isActive: 1 });

/** Next dev can retain a compiled model from before these fields existed. */
export function categorySchemaNeedsRefresh(schema: Schema) {
  return !schema.path("source") || Boolean(schema.path("usage"));
}
if (mongoose.models.Category && categorySchemaNeedsRefresh(mongoose.models.Category.schema)) {
  // Only replace the in-process model registration; no database data is removed.
  mongoose.deleteModel("Category");
}

const CategoryModel: Model<ICategory> =
  mongoose.models.Category ||
  mongoose.model<ICategory>("Category", CategorySchema);

export default CategoryModel;
