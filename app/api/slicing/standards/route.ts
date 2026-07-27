import { NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import BodegaProductModel from "@/models/BodegaProduct";
import StandardPackingModel from "@/models/StandardPacking";

function cleanLabel(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export async function GET() {
  const { response } = await requirePermission(["slicing.manage", "slicing.view", "standard-packing.view", "standard-packing.manage"]);
  if (response) return response;

  await dbConnect();

  // Register the BodegaProduct model before populate().
  void BodegaProductModel;

  const standards = await StandardPackingModel.find({ isActive: true })
    .populate("wholeChickenId", "name stockQty")
    .populate("productId", "name")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    success: true,
    data: standards.map((standard: any) => {
      const wholeChickenName = cleanLabel(standard.wholeChickenId?.name || "");
      const productName = cleanLabel(standard.productId?.name || "");

      return {
        _id: standard._id.toString(),
        wholeChickenId:
          standard.wholeChickenId?._id?.toString?.() ||
          standard.wholeChickenId?.toString?.() ||
          "",
        wholeChickenName,
        productId:
          standard.productId?._id?.toString?.() ||
          standard.productId?.toString?.() ||
          "",
        productName,
        standardPacking: Number(standard.standardPacking || 0),
        minimumKilos: Number(standard.minimumKilos || 0),
        maximumKilos: Number(standard.maximumKilos || 0),
        standardSlice: Number(standard.standardSlice || 0),
        chickenSizeType: standard.chickenSizeType || "",
        availableStock: Number(standard.wholeChickenId?.stockQty || 0),
        label: `${wholeChickenName} → ${productName}`,
      };
    }),
  });
}
