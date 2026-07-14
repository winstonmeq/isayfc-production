import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { cleanNumber, cleanString } from "@/lib/crud-utils";
import ProductModel from "@/models/Product";
import SlicingStandardModel from "@/models/SlicingStandard";

type StringableId = { toString: () => string };

type PopulatedProduct = {
  _id?: StringableId;
  name?: string;
  toString?: () => string;
};

type SlicingStandardRecord = {
  _id: StringableId;
  wholeChickenId?: PopulatedProduct;
  productId?: PopulatedProduct;
  standardPacking?: number;
  standardSlice?: number;
  chickenSizeType?: string;
};

function serializeStandard(item: SlicingStandardRecord) {
  return {
    _id: item._id.toString(),
    wholeChickenId:
      item.wholeChickenId?._id?.toString?.() || item.wholeChickenId?.toString?.(),
    wholeChickenName: item.wholeChickenId?.name || "",
    productId: item.productId?._id?.toString?.() || item.productId?.toString?.(),
    productName: item.productId?.name || "",
    standardPacking: item.standardPacking || 0,
    standardSlice: item.standardSlice || 0,
    chickenSizeType: item.chickenSizeType || "-",
  };
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("standard-packing.manage");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid standard ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const body = await req.json();

  const wholeChickenId = cleanString(body.wholeChickenId);
  const productId = cleanString(body.productId);
  const standardPacking = cleanNumber(body.standardPacking);
  const standardSlice = cleanNumber(body.standardSlice);
  const chickenSizeType = cleanString(body.chickenSizeType) || "-";

  if (!wholeChickenId || !isValidObjectId(wholeChickenId)) {
    return NextResponse.json(
      { success: false, message: "Valid whole chicken product is required." },
      { status: 400 }
    );
  }

  if (!productId || !isValidObjectId(productId)) {
    return NextResponse.json(
      { success: false, message: "Valid sliced product is required." },
      { status: 400 }
    );
  }

  if (standardPacking <= 0 || standardSlice <= 0) {
    return NextResponse.json(
      {
        success: false,
        message: "Standard packing and standard slice must be greater than zero.",
      },
      { status: 400 }
    );
  }

  const [wholeChicken, product] = await Promise.all([
    ProductModel.exists({ _id: wholeChickenId, isActive: true }),
    ProductModel.exists({ _id: productId, isActive: true }),
  ]);

  if (!wholeChicken || !product) {
    return NextResponse.json(
      { success: false, message: "Selected product was not found." },
      { status: 404 }
    );
  }

  const updated = await SlicingStandardModel.findOneAndUpdate(
    {
      _id: id,
      isActive: true,
    },
    {
      wholeChickenId,
      productId,
      standardPacking,
      standardSlice,
      chickenSizeType,
    },
    { new: true }
  )
    .populate("wholeChickenId", "name")
    .populate("productId", "name")
    .lean<SlicingStandardRecord | null>();

  if (!updated) {
    return NextResponse.json(
      { success: false, message: "Standard packing not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Standard packing updated successfully.",
    data: serializeStandard(updated),
  });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("standard-packing.manage");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid standard ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const deleted = await SlicingStandardModel.findOneAndUpdate(
    {
      _id: id,
      isActive: true,
    },
    {
      isActive: false,
    },
    { new: true }
  ).lean();

  if (!deleted) {
    return NextResponse.json(
      { success: false, message: "Standard packing not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Standard packing deleted successfully.",
  });
}
