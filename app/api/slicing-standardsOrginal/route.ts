import { NextRequest, NextResponse } from "next/server";
import type { QueryFilter } from "mongoose";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import {
  cleanNumber,
  cleanString,
  escapeRegex,
  getPagination,
} from "@/lib/crud-utils";
import ProductModel from "@/models/Product";
import SlicingStandardModel, {
  ISlicingStandard,
} from "@/models/SlicingStandard";

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

export async function GET(req: NextRequest) {
  const { response } = await requirePermission([
    "standard-packing.view",
    "standard-packing.manage",
    "slicing.view",
    "slicing.manage",
  ]);
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);

  const chickenSizeType = cleanString(searchParams.get("chickenSizeType"));

  const filter: QueryFilter<ISlicingStandard> = {
    isActive: true,
  };

  if (chickenSizeType && chickenSizeType !== "ALL") {
    filter.chickenSizeType = {
      $regex: escapeRegex(chickenSizeType),
      $options: "i",
    };
  }

  const [items, total] = await Promise.all([
    SlicingStandardModel.find(filter)
      .populate("wholeChickenId", "name")
      .populate("productId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<SlicingStandardRecord[]>(),

    SlicingStandardModel.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map(serializeStandard),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

export async function POST(req: NextRequest) {
  const { response } = await requirePermission("standard-packing.manage");
  if (response) return response;

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

  if (standardPacking <= 0) {
    return NextResponse.json(
      { success: false, message: "Standard packing must be greater than zero." },
      { status: 400 }
    );
  }

  if (standardSlice <= 0) {
    return NextResponse.json(
      { success: false, message: "Standard slice must be greater than zero." },
      { status: 400 }
    );
  }

  const [wholeChicken, product] = await Promise.all([
    ProductModel.exists({ _id: wholeChickenId, isActive: true }),
    ProductModel.exists({ _id: productId, isActive: true }),
  ]);

  if (!wholeChicken) {
    return NextResponse.json(
      { success: false, message: "Whole chicken product not found." },
      { status: 404 }
    );
  }

  if (!product) {
    return NextResponse.json(
      { success: false, message: "Sliced product not found." },
      { status: 404 }
    );
  }

  const standard = await SlicingStandardModel.create({
    wholeChickenId,
    productId,
    standardPacking,
    standardSlice,
    chickenSizeType,
  });

  const populated = await SlicingStandardModel.findById(standard._id)
    .populate("wholeChickenId", "name")
    .populate("productId", "name")
    .lean<SlicingStandardRecord | null>();

  if (!populated) {
    return NextResponse.json(
      { success: false, message: "Standard packing was created but could not be loaded." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Standard packing created successfully.",
      data: serializeStandard(populated),
    },
    { status: 201 }
  );
}
