import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString } from "@/lib/crud-utils";
import BodegaProductModel from "@/models/BodegaProduct";

import StandardPackingModel from "@/models/StandardPacking";

function serializeStandard(item: any) {
  return {
    _id: item._id.toString(),

    wholeChickenId:
      item.wholeChickenId?._id?.toString?.() || item.wholeChickenId?.toString?.(),
    wholeChickenName: item.wholeChickenId?.name || "",

    productId: item.productId?._id?.toString?.() || item.productId?.toString?.(),
    productName: item.productId?.name || "",

    standardPacking: Number(item.standardPacking || 0),
    minimumKilos: Number(item.minimumKilos || 0),
    maximumKilos: Number(item.maximumKilos || 0),
    standardSlice: Number(item.standardSlice || 0),
    chickenSizeType: item.chickenSizeType || "",
  };
}

async function handlePATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("standard-packing.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid standard packing ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const body = await req.json();

  const wholeChickenId = cleanString(body.wholeChickenId);
  const productId = cleanString(body.productId);
  const standardPacking = cleanNumber(body.standardPacking);
  const minimumKilos = cleanNumber(body.minimumKilos);
  const maximumKilos = cleanNumber(body.maximumKilos);
  const standardSlice = cleanNumber(body.standardSlice);
  const chickenSizeType = cleanString(body.chickenSizeType);

  if (!wholeChickenId || !isValidObjectId(wholeChickenId)) {
    return NextResponse.json(
      { success: false, message: "Whole chicken product is required." },
      { status: 400 }
    );
  }

  if (!productId || !isValidObjectId(productId)) {
    return NextResponse.json(
      { success: false, message: "Output product is required." },
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

  if (minimumKilos < 0 || maximumKilos < 0) {
    return NextResponse.json(
      { success: false, message: "Kilo limits cannot be negative." },
      { status: 400 }
    );
  }

  if (maximumKilos > 0 && maximumKilos < minimumKilos) {
    return NextResponse.json(
      {
        success: false,
        message: "Maximum kilos must be greater than or equal to minimum kilos.",
      },
      { status: 400 }
    );
  }

  const [wholeChicken, product] = await Promise.all([
    BodegaProductModel.findOne({ _id: wholeChickenId, isActive: true }),
    BodegaProductModel.findOne({ _id: productId, isActive: true }),
  ]);

  if (!wholeChicken || !product) {
    return NextResponse.json(
      { success: false, message: "Selected product not found." },
      { status: 404 }
    );
  }

  const item = await StandardPackingModel.findOneAndUpdate(
    {
      _id: id,
      isActive: true,
    },
    {
      wholeChickenId,
      productId,
      standardPacking,
      minimumKilos,
      maximumKilos,
      standardSlice,
      chickenSizeType,
    },
    {
      new: true,
    }
  )
    .populate("wholeChickenId", "name")
    .populate("productId", "name");

  if (!item) {
    return NextResponse.json(
      { success: false, message: "Standard packing not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Standard packing updated successfully.",
    data: serializeStandard(item.toObject()),
  });
}

async function handleDELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("standard-packing.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid standard packing ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const item = await StandardPackingModel.findOneAndUpdate(
    {
      _id: id,
      isActive: true,
    },
    {
      isActive: false,
    }
  );

  if (!item) {
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

export const PATCH = withAuditLog(handlePATCH, {
  module: "STANDARD_PACKING",
  action: "UPDATE",
  entityType: "STANDARD_PACKING",
});

export const DELETE = withAuditLog(handleDELETE, {
  module: "STANDARD_PACKING",
  action: "DELETE",
  entityType: "STANDARD_PACKING",
});
