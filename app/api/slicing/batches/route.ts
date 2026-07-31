import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import ProductModel from "@/models/Product";
import SlicingBatchModel from "@/models/SlicingBatch";
import SlicingItemModel from "@/models/SlicingItem";
import SlicingStandardModel from "@/models/SlicingStandard";

const MIN_SLICING_YIELD_RATE = 0.7;
const MAX_SLICING_YIELD_RATE = 1.2;
const MAX_HEADS_PER_ROW = 1_000;

// A user-input problem, not a server fault: the catch returns these as 400
// (matching /api/slicing, which returns the same rules as 400) so clients
// don't retry or show a generic "server error" for a recount request.
class ValidationError extends Error {}

type StringableId = { toString: () => string };

type PopulatedProduct = {
  _id: StringableId;
  name?: string;
};

type SlicingStandardRecord = {
  _id: StringableId;
  wholeChickenId: PopulatedProduct;
  productId: PopulatedProduct;
  standardSlice?: number;
  standardPacking?: number;
};

type SlicingBatchInputItem = {
  standardId?: string;
  bags?: unknown;
  heads?: unknown;
  kilos?: unknown;
  actualSlicedPcs?: unknown;
};

type SlicingBatchInput = {
  slicingDate?: string;
  slicer?: string;
  packer?: string;
  items?: SlicingBatchInputItem[];
};

type SlicingBatchRecord = {
  _id: StringableId;
  slicingDate?: Date;
  slicer?: string;
  packer?: string;
  totalHeads?: number;
  totalKilos?: number;
  totalStdPcs?: number;
  totalActualPcs?: number;
  totalPacks?: number;
  totalVariance?: number;
  isVoided?: boolean;
  createdAt?: Date;
};

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatNumber(value: number, digits = 2) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export async function POST(req: NextRequest) {
  const { response } = await requirePermission("slicing.manage");
  if (response) return response;

  const session = await mongoose.startSession();

  try {
    await dbConnect();

    // Important for populate.
    void ProductModel;

    const body = (await req.json()) as SlicingBatchInput;

    const {
      slicingDate,
      slicer,
      packer,
      items = [],
    } = body;

    if (!slicer || !packer) {
      return NextResponse.json(
        {
          success: false,
          message: "Slicer and packer are required.",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "At least one slicing item is required.",
        },
        { status: 400 }
      );
    }

    const standardIds = items
      .map((item) => String(item.standardId || ""))
      .filter(Boolean);

    const standards = await SlicingStandardModel.find({
      _id: { $in: standardIds },
      isActive: true,
    })
      .populate("wholeChickenId", "name")
      .populate("productId", "name")
      .lean<SlicingStandardRecord[]>();

    const standardMap = new Map(
      standards.map((standard) => [standard._id.toString(), standard])
    );

    const preparedItems = items.map((item) => {
      const standard = standardMap.get(String(item.standardId || ""));

      if (!standard) {
        throw new ValidationError("Selected slicing standard was not found.");
      }

      const bags = toNumber(item.bags);
      const heads = toNumber(item.heads);
      const kilos = toNumber(item.kilos);
      const actualSlicedPcs = toNumber(item.actualSlicedPcs);

      const standardSlice = toNumber(standard.standardSlice);
      const standardPacking = toNumber(standard.standardPacking);

      if (heads <= 0) {
        throw new ValidationError("Heads must be greater than zero.");
      }

      if (!Number.isInteger(heads) || heads > MAX_HEADS_PER_ROW) {
        throw new ValidationError(`Heads must be a whole number up to ${MAX_HEADS_PER_ROW}.`);
      }

      if (bags > 0 && !Number.isInteger(bags)) {
        throw new ValidationError("Bags must be a whole number.");
      }

      if (actualSlicedPcs <= 0) {
        throw new ValidationError("Actual sliced PCS must be greater than zero.");
      }

      if (!Number.isInteger(actualSlicedPcs)) {
        throw new ValidationError("Actual sliced PCS must be a whole number.");
      }

      if (standardSlice <= 0 || standardPacking <= 0) {
        throw new ValidationError("Selected slicing standard has invalid values.");
      }

      const totalStdPcs = heads * standardSlice;
      const yieldRate = totalStdPcs > 0 ? actualSlicedPcs / totalStdPcs : 0;

      if (
        yieldRate < MIN_SLICING_YIELD_RATE ||
        yieldRate > MAX_SLICING_YIELD_RATE
      ) {
        throw new ValidationError(
          `Yield is ${formatNumber(yieldRate * 100)}%. Expected range is ${formatNumber(MIN_SLICING_YIELD_RATE * 100, 0)}% to ${formatNumber(MAX_SLICING_YIELD_RATE * 100, 0)}%. Please recount before saving.`
        );
      }

      const actualPacks =
        standardPacking > 0
          ? Math.floor(actualSlicedPcs / standardPacking)
          : 0;

      const butal =
        standardPacking > 0
          ? actualSlicedPcs % standardPacking
          : actualSlicedPcs;

      const variance = actualSlicedPcs - totalStdPcs;

      return {
        standardId: standard._id,

        mainProductId: standard.wholeChickenId._id,
        slicedProductId: standard.productId._id,

        mainProductName: standard.wholeChickenId.name,
        slicedProductName: standard.productId.name,

        bags,
        heads,
        kilos,

        standardSlice,
        standardPacking,

        totalStdPcs,
        actualSlicedPcs,
        actualPacks,
        butal,
        variance,
      };
    });

    const totals = preparedItems.reduce(
      (sum, item) => {
        sum.totalHeads += item.heads;
        sum.totalKilos += item.kilos;
        sum.totalStdPcs += item.totalStdPcs;
        sum.totalActualPcs += item.actualSlicedPcs;
        sum.totalPacks += item.actualPacks;
        sum.totalVariance += item.variance;
        return sum;
      },
      {
        totalHeads: 0,
        totalKilos: 0,
        totalStdPcs: 0,
        totalActualPcs: 0,
        totalPacks: 0,
        totalVariance: 0,
      }
    );

    let savedBatch: unknown;
    let savedItems: unknown[] = [];

    await session.withTransaction(async () => {
      const [batch] = await SlicingBatchModel.create(
        [
          {
            slicingDate: slicingDate ? new Date(slicingDate) : new Date(),
            slicer,
            packer,
            ...totals,
          },
        ],
        { session }
      );

      savedBatch = batch;

      savedItems = await SlicingItemModel.insertMany(
        preparedItems.map((item) => ({
          ...item,
          batchId: batch._id,
        })),
        { session }
      );
    });

    return NextResponse.json(
      {
        success: true,
        message: "Slicing batch saved successfully.",
        data: {
          batch: savedBatch,
          items: savedItems,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    // Input problems (yield out of range, bad counts) are the user's to fix —
    // return 400 like /api/slicing does for the same rules, so clients show
    // the message instead of treating it as a retryable server error.
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    console.error("CREATE SLICING BATCH ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to save slicing batch.",
      },
      { status: 500 }
    );
  } finally {
    session.endSession();
  }
}


export async function GET(req: NextRequest) {
  const { response } = await requirePermission(["slicing.view", "slicing.manage"]);
  if (response) return response;

  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);

    const page = Number(searchParams.get("page") || 1);
    const limit = Number(searchParams.get("limit") || 10);
    const search = searchParams.get("search") || "";

    const skip = (page - 1) * limit;

    const filter: {
      isVoided: boolean;
      $or?: Array<Record<string, { $regex: string; $options: string }>>;
    } = {
      isVoided: false,
    };

    if (search) {
      filter.$or = [
        { slicer: { $regex: search, $options: "i" } },
        { packer: { $regex: search, $options: "i" } },
      ];
    }

    const [records, total] = await Promise.all([
      SlicingBatchModel.find(filter)
        .sort({ slicingDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<SlicingBatchRecord[]>(),

      SlicingBatchModel.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      data: records.map((batch) => ({
        _id: batch._id.toString(),
        slicingDate: batch.slicingDate,
        slicer: batch.slicer,
        packer: batch.packer,
        totalHeads: batch.totalHeads,
        totalKilos: batch.totalKilos,
        totalStdPcs: batch.totalStdPcs,
        totalActualPcs: batch.totalActualPcs,
        totalPacks: batch.totalPacks,
        totalVariance: batch.totalVariance,
        isVoided: batch.isVoided,
        createdAt: batch.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    console.error("GET SLICING HISTORY ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to load slicing history.",
      },
      { status: 500 }
    );
  }
}
