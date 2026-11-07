import type { ClientSession, Types } from "mongoose";
import BodegaProductModel from "@/models/BodegaProduct";
import ProductModel from "@/models/Product";
import OutletInventoryModel from "@/models/OutletInventory";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import StandardPacking from "@/models/StandardPacking";
import { productQuantityAllowed } from "@/lib/product-units";
import { adjustmentQuantities } from "./adjustment-quantities";

export type CountInventoryType = "BODEGA" | "GROCERY" | "OUTLET";

export async function loadInventoryItem(type: CountInventoryType, id: string | Types.ObjectId, session?: ClientSession) {
  const query = type === "BODEGA"
    ? BodegaProductModel.findById(id)
    : type === "GROCERY"
      ? ProductModel.findById(id)
      : OutletInventoryModel.findById(id);
  if (session) query.session(session);
  const item: any = await query;
  if (!item || item.isActive === false) throw new Error("Inventory item not found.");
  const qty = type === "BODEGA" ? Number(item.stockQty || 0)
    : type === "GROCERY" ? Number(item.stockPcs || 0)
      : Number(item.stockQty || 0);
  const name = type === "OUTLET" ? item.productName : item.name;
  const whole = type === "BODEGA" && item.unitCode !== "KG" && (item.unitCode === "HEAD" || !!await StandardPacking.exists({ wholeChickenId: item._id, isActive: true }).session(session || null));
  const unit = type === "OUTLET" ? item.unitLabel : whole ? "HEAD" : type === "BODEGA" ? item.unitCode === "KG" ? "KG" : "PCS" : item.unitCode || "PCS";
  return { item, qty, name, unit, whole, kilos: Number(item.stockKilos || 0) };
}

export async function setInventoryQuantity(args: {
  type: CountInventoryType; id: string | Types.ObjectId; newQty: number; newKilos?: number; date: Date;
  reason: string; referenceType: string; referenceId: Types.ObjectId; createdBy?: string; session: ClientSession;
}) {
  const { item, qty: previousQty, name, unit, whole, kilos } = await loadInventoryItem(args.type, args.id, args.session);
  const quantities = adjustmentQuantities({ qty: previousQty, kilos }, { qty: args.newQty, kilos: args.newKilos }, whole);
  if (!await productQuantityAllowed(unit, args.newQty)) throw new Error(`Invalid quantity for ${unit}.`);
  const difference = args.newQty - previousQty;
  if (args.type === "BODEGA") item.stockQty = args.newQty;
  else if (args.type === "GROCERY") item.stockPcs = args.newQty;
  else item.stockQty = args.newQty;
  if (whole) { item.stockHeads = args.newQty; item.stockKilos = args.newKilos; }
  else if (args.type === "BODEGA" && unit === "KG") item.stockKilos = args.newQty;
  await item.save({ session: args.session });

  const common = { transactionDate: args.date, type: "ADJUSTMENT" as const, quantity: Math.abs(difference), previousStock: previousQty, newStock: args.newQty, remarks: args.reason, referenceType: args.referenceType, referenceId: args.referenceId, createdBy: args.createdBy };
  if (args.type === "BODEGA") {
    await BodegaStockTransactionModel.create([{ ...common, bodegaProductId: item._id, pieces: whole ? 0 : Math.abs(difference), heads: whole ? Math.abs(difference) : 0, kilos: Math.abs(quantities.adjustedKilos || 0), kilosDelta: quantities.adjustedKilos }], { session: args.session });
  } else if (args.type === "GROCERY") {
    await InventoryTransactionModel.create([{ ...common, productId: item._id, unit: "PCS", unitCode: unit }], { session: args.session });
  } else {
    await OutletStockTransactionModel.create([{ ...common, outletId: item.outletId, outletInventoryId: item._id, productSource: item.productSource, productId: item.productId, productName: item.productName, unitCost: item.buyingPrice || 0, entryUnit: item.unitLabel, entryQty: Math.abs(difference), multiplier: 1, baseUnit: item.unitLabel === "PACK" ? "PCS" : item.unitLabel === "HEAD" ? "HEAD" : item.unitLabel === "KG" ? "KG" : item.unitLabel === "PCS" ? "PCS" : "QTY", sourceChannel: "WEB" }], { session: args.session });
  }
  return { difference, name, unit, ...quantities };
}
