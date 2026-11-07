// app/api/sales/chicken-products/route.ts
import { NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import BodegaProductModel from "@/models/BodegaProduct";
import CategoryModel from "@/models/Category";
import StandardPackingModel from "@/models/StandardPacking";
import { bodegaSaleAvailability } from "@/lib/product-classification";

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function wholeNumber(value: unknown) {
  return Math.max(0, Math.trunc(numberValue(value)));
}

export async function GET() {
  const { response } = await requirePermission(["sales.manage", "sales.view"]);
  if (response) return response;

  await dbConnect();

  // Register Category for population; category names must not determine source.
  void CategoryModel;
  const products = await BodegaProductModel.find({
    isActive: true,
  })
    .populate("categoryId", "name")
    .sort({ name: 1 })
    .lean();

  const standards = await StandardPackingModel.find({
    isActive: true,
    productId: { $in: products.map((product) => product._id) },
  })
    .sort({ createdAt: -1 })
    .lean();

  const standardsByOutput = new Map<string, any>();
  for (const standard of standards) {
    const productId = standard.productId.toString();
    if (standardsByOutput.has(productId)) continue;
    const packSize = wholeNumber(standard.standardPacking);
    if (packSize <= 0) continue;
    standardsByOutput.set(productId, standard);
  }

  const data = products.map((product: any) => {
    const productId = product._id.toString();
    const standard = standardsByOutput.get(productId);
    const packSize = standard ? wholeNumber(standard.standardPacking) : 0;
    const stockPcs = wholeNumber(product.stockQty);
    const stockHeads = wholeNumber(product.stockHeads);
    const { saleUnit, availableQty } = bodegaSaleAvailability(product, packSize);
    const availablePacks = packSize > 0 ? Math.floor(stockPcs / packSize) : 0;
    const loosePcs = packSize > 0 ? stockPcs - availablePacks * packSize : 0;
    const pricePerUnit = numberValue(product.sellingPrice);

    return {
      _id: productId,
      productId,
      bodegaProductId: productId,
      standardId: standard?._id?.toString?.() || "",
      name: product.name,
      inventorySource: "BODEGA",
      categoryId: product.categoryId?._id?.toString?.() || "",
      categoryName: product.categoryId?.name || "",
      saleUnit,
      pricePerUnit,
      pricePerPack: saleUnit === "PACK" ? pricePerUnit : 0,
      pricePerPcs: packSize > 0 ? pricePerUnit / packSize : 0,
      packSize,
      stockPcs,
      stockHeads,
      stockKilos: numberValue(product.stockKilos),
      availableQty,
      availablePacks,
      loosePcs,
    };
  });

  return NextResponse.json({
    success: true,
    data,
  });
}
