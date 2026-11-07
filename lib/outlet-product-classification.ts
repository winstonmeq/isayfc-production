import { isValidObjectId, type ClientSession, type Types } from "mongoose";
import Category from "@/models/Category";
import Product from "@/models/Product";
import BodegaProduct from "@/models/BodegaProduct";

/** Classification only: never posts expenses or changes quantities/costs. */
export async function outletProductClassification(source: "BODEGA" | "GROCERY", productId: unknown, session?: ClientSession, fallbackName = "") {
  const product = source === "GROCERY"
    ? await Product.findById(productId).select("categoryId").session(session || null).lean()
    : await BodegaProduct.findById(productId).select("categoryId").session(session || null).lean();
  const category = product?.categoryId
    ? await Category.findById(product.categoryId).select("name").session(session || null).lean()
    : null;
  return { categoryId: category?._id, categoryName: category?.name || fallbackName };
}

/** Resolve current master classification for received stock, including older rows. */
export async function classifyOutletInventoryRows<T extends { productId?: unknown; productSource?: string; originType?: string; categoryName?: string }>(rows: T[]) {
  const received = rows.filter((row) => (!row.originType || row.originType === "TRANSFER") && isValidObjectId(row.productId));
  const [grocery, bodega] = await Promise.all([
    Product.find({ _id: { $in: received.filter((row) => row.productSource === "GROCERY").map((row) => String(row.productId)) } }).select("categoryId usage").lean(),
    BodegaProduct.find({ _id: { $in: received.filter((row) => row.productSource === "BODEGA").map((row) => String(row.productId)) } }).select("categoryId usage").lean(),
  ]);
  const products = new Map<string, { categoryId?: Types.ObjectId; usage?: string }>([...grocery.map((product) => [`GROCERY:${product._id}`, product] as const), ...bodega.map((product) => [`BODEGA:${product._id}`, product] as const)]);
  const categories = await Category.find({ _id: { $in: [...products.values()].flatMap((product) => product.categoryId ? [product.categoryId] : []) } }).select("name").lean();
  const directory = new Map(categories.map((category) => [String(category._id), category]));
  return rows.map((row) => {
    const product = !row.originType || row.originType === "TRANSFER" ? products.get(`${row.productSource}:${row.productId}`) : undefined;
    const category = product?.categoryId ? directory.get(String(product.categoryId)) : undefined;
    return {
      ...row,
      usage: product?.usage || "UNASSIGNED",
      ...(category ? { categoryId: category._id, categoryName: category.name } : {}),
    };
  });
}
