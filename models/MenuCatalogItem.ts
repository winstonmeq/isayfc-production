import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IMenuCatalogComponent {
  productSource: "BODEGA" | "GROCERY";
  productId: Types.ObjectId;
  productName: string;
  qtyPerSale: number;
}

export interface IMenuCatalogItem extends Document {
  _id: Types.ObjectId;
  name: string;
  normalizedName: string;
  category: string;
  defaultPrice: number;
  imageUrl?: string;
  components: IMenuCatalogComponent[];
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ComponentSchema = new Schema<IMenuCatalogComponent>(
  {
    productSource: { type: String, enum: ["BODEGA", "GROCERY"], required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    productName: { type: String, default: "", trim: true },
    qtyPerSale: { type: Number, default: 1, min: 0 },
  },
  { _id: false }
);

const MenuCatalogItemSchema = new Schema<IMenuCatalogItem>(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
    category: { type: String, default: "Others", trim: true },
    defaultPrice: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, trim: true, default: "" },
    components: { type: [ComponentSchema], default: [] },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

MenuCatalogItemSchema.index(
  { normalizedName: 1, category: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);
MenuCatalogItemSchema.index({ isActive: 1, category: 1, name: 1 });

const MenuCatalogItemModel: Model<IMenuCatalogItem> =
  mongoose.models.MenuCatalogItem ||
  mongoose.model<IMenuCatalogItem>("MenuCatalogItem", MenuCatalogItemSchema);

export default MenuCatalogItemModel;
