// models/OutletMenuItem.ts
import mongoose, { Document, Model, Schema, Types } from "mongoose";

/**
 * A sellable item on an outlet's POS menu (e.g. "Fried Chicken C10 - 15").
 * This is the RETAIL product the cashier sells for cash, distinct from the
 * raw outlet inventory it may consume.
 *
 * `components` optionally map the menu item to raw outlet-inventory stock that
 * gets deducted on each sale. Example: one "Fried Chicken C10" consumes 1 pc of
 * the C10 outlet-inventory item. An empty components array = sell with no stock
 * deduction (revenue only).
 */
export interface IOutletMenuComponent {
  // References an OutletInventory record's identity (productSource + productId).
  productSource: "BODEGA" | "GROCERY";
  productId: Types.ObjectId;
  productName: string; // snapshot for display
  // How many base units (pcs) are consumed per 1 menu item sold.
  qtyPerSale: number;
}

export interface IOutletMenuItem extends Document {
  _id: Types.ObjectId;
  outletId: Types.ObjectId;
  name: string;
  category: string; // e.g. "Chicken", "Drinks", "Rice", "Meals"
  price: number;
  imageUrl?: string; // optional photo, e.g. "/uploads/menu/<uuid>.jpg"
  sortOrder: number;
  isAvailable: boolean;
  components: IOutletMenuComponent[];
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ComponentSchema = new Schema<IOutletMenuComponent>(
  {
    productSource: {
      type: String,
      enum: ["BODEGA", "GROCERY"],
      required: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    productName: { type: String, default: "", trim: true },
    qtyPerSale: { type: Number, default: 1, min: 0 },
  },
  { _id: false }
);

const OutletMenuItemSchema = new Schema<IOutletMenuItem>(
  {
    outletId: {
      type: Schema.Types.ObjectId,
      ref: "Outlet",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: "Others",
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    components: {
      type: [ComponentSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

OutletMenuItemSchema.index({ outletId: 1, isActive: 1, category: 1, sortOrder: 1 });
OutletMenuItemSchema.index({ outletId: 1, name: 1 });

const OutletMenuItemModel: Model<IOutletMenuItem> =
  mongoose.models.OutletMenuItem ||
  mongoose.model<IOutletMenuItem>("OutletMenuItem", OutletMenuItemSchema);

export default OutletMenuItemModel;
