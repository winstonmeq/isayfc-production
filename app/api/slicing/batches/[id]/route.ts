import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import SlicingBatchModel from "@/models/SlicingBatch";
import SlicingItemModel from "@/models/SlicingItem";

type StringableId = { toString: () => string };

type SlicingBatchDetail = {
  _id: StringableId;
  [key: string]: unknown;
};

type SlicingItemDetail = {
  _id: StringableId;
  batchId: StringableId;
  standardId: StringableId;
  mainProductId: StringableId;
  slicedProductId: StringableId;
  mainProductName?: string;
  slicedProductName?: string;
  bags?: number;
  heads?: number;
  kilos?: number;
  standardSlice?: number;
  standardPacking?: number;
  totalStdPcs?: number;
  actualSlicedPcs?: number;
  actualPacks?: number;
  butal?: number;
  variance?: number;
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission(["slicing.view", "slicing.manage"]);
  if (response) return response;

  try {
    await dbConnect();

    const { id } = await context.params;

    const batch = await SlicingBatchModel.findById(id).lean<SlicingBatchDetail | null>();

    if (!batch) {
      return NextResponse.json(
        {
          success: false,
          message: "Slicing batch not found.",
        },
        { status: 404 }
      );
    }

    const items = await SlicingItemModel.find({ batchId: id })
      .sort({ createdAt: 1 })
      .lean<SlicingItemDetail[]>();

    return NextResponse.json({
      success: true,
      data: {
        batch: {
          ...batch,
          _id: batch._id.toString(),
        },
        items: items.map((item) => ({
          _id: item._id.toString(),
          batchId: item.batchId.toString(),
          standardId: item.standardId.toString(),

          mainProductId: item.mainProductId.toString(),
          slicedProductId: item.slicedProductId.toString(),

          mainProductName: item.mainProductName,
          slicedProductName: item.slicedProductName,

          bags: item.bags,
          heads: item.heads,
          kilos: item.kilos,

          standardSlice: item.standardSlice,
          standardPacking: item.standardPacking,

          totalStdPcs: item.totalStdPcs,
          actualSlicedPcs: item.actualSlicedPcs,
          actualPacks: item.actualPacks,
          butal: item.butal,
          variance: item.variance,
        })),
      },
    });
  } catch (error: unknown) {
    console.error("GET SLICING BATCH DETAIL ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to load slicing batch detail.",
      },
      { status: 500 }
    );
  }
}
