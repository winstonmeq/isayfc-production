import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanNumber, cleanString, getPagination } from "@/lib/crud-utils";
import { getSlicingKiloIssue, getSlicingVariance } from "@/lib/slicing-validation";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import SlicingBatchModel from "@/models/SlicingBatch";
import SlicingItemModel from "@/models/SlicingItem";
import StandardPackingModel from "@/models/StandardPacking";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MIN_SLICING_YIELD_RATE = 0.7;
const MAX_SLICING_YIELD_RATE = 1.2;
const MAX_KILOS_PER_HEAD = 4;
const MAX_HEADS_PER_ROW = 1_000;

type SlicingItemInput = {
  standardId?: string;
  standardPackingId?: string;
  slicingStandardId?: string;
  bags?: number;
  heads?: number;
  qtyToSlice?: number;
  kilos?: number;
  actualSlicedPcs?: number;
};

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number, digits = 2) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function buildDateFilter(dateFrom: string, dateTo: string) {
  const filter: Record<string, any> = {};

  if (dateFrom || dateTo) {
    filter.slicingDate = {};

    if (dateFrom) {
      filter.slicingDate.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }

    if (dateTo) {
      filter.slicingDate.$lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
  }

  return filter;
}

function uniqueClean(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .flat()
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function serializeSlicingItem(item: any) {
  const batchId = item.batchId?._id?.toString?.() || item.batchId?.toString?.() || "";
  const totalStdPcs = toNumber(item.totalStdPcs);
  const actualSlicedPcs = toNumber(item.actualSlicedPcs);

  return {
    _id: item._id.toString(),
    batchId,
    mainProductName: item.mainProductName,
    slicedProductName: item.slicedProductName,
    qtyToSlice: item.heads || 0,
    heads: item.heads || 0,
    actualSlicedPcs,
    standardSlice: item.standardSlice || 0,
    standardPacking: item.standardPacking || 0,
    minimumKilos: item.minimumKilos || 0,
    maximumKilos: item.maximumKilos || 0,
    totalStdPcs,
    actualPacks: item.actualPacks || 0,
    butal: item.butal || 0,
    variance: getSlicingVariance(actualSlicedPcs, totalStdPcs),
    kilos: item.kilos || 0,
    bags: item.bags || 0,
    slicingDate: item.batchId?.slicingDate
      ? new Date(item.batchId.slicingDate).toISOString()
      : undefined,
    slicer: item.batchId?.slicer || "",
    packer: item.batchId?.packer || "",
  };
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(["slicing.view", "slicing.manage"]);
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const slicedProductId = cleanString(searchParams.get("slicedProductId"));
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));
  const groupBy = cleanString(searchParams.get("groupBy"));
  const view = cleanString(searchParams.get("view"));
  const dailyView = groupBy === "daily" || view === "daily";

  if (dailyView) {
    const batchMatch: Record<string, any> = {
      "batch.isVoided": false,
    };

    const dateFilter = buildDateFilter(dateFrom, dateTo);
    if (dateFilter.slicingDate) {
      batchMatch["batch.slicingDate"] = dateFilter.slicingDate;
    }

    const itemMatch: Record<string, any> = {};
    if (slicedProductId && slicedProductId !== "ALL" && isValidObjectId(slicedProductId)) {
      itemMatch.slicedProductId = new mongoose.Types.ObjectId(slicedProductId);
    }

    const pipeline: any[] = [
      {
        $lookup: {
          from: "slicingbatches",
          localField: "batchId",
          foreignField: "_id",
          as: "batch",
        },
      },
      { $unwind: "$batch" },
      { $match: batchMatch },
    ];

    if (Object.keys(itemMatch).length > 0) {
      pipeline.push({ $match: itemMatch });
    }

    pipeline.push(
      {
        $group: {
          _id: {
            day: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$batch.slicingDate",
              },
            },
            mainProductName: "$mainProductName",
            slicedProductName: "$slicedProductName",
            standardPacking: "$standardPacking",
          },
          firstDate: { $min: "$batch.slicingDate" },
          batchIds: { $addToSet: "$batch._id" },
          slicers: { $addToSet: "$batch.slicer" },
          packers: { $addToSet: "$batch.packer" },
          activityCount: { $sum: 1 },
          bags: { $sum: "$bags" },
          heads: { $sum: "$heads" },
          kilos: { $sum: "$kilos" },
          totalStdPcs: { $sum: "$totalStdPcs" },
          actualSlicedPcs: { $sum: "$actualSlicedPcs" },
          actualPacks: { $sum: "$actualPacks" },
          butal: { $sum: "$butal" },
          variance: { $sum: { $subtract: ["$actualSlicedPcs", "$totalStdPcs"] } },
        },
      },
      {
        $group: {
          _id: "$_id.day",
          slicingDate: { $first: "$firstDate" },
          batchIds: { $push: "$batchIds" },
          slicers: { $push: "$slicers" },
          packers: { $push: "$packers" },
          activityCount: { $sum: "$activityCount" },
          bags: { $sum: "$bags" },
          heads: { $sum: "$heads" },
          kilos: { $sum: "$kilos" },
          totalStdPcs: { $sum: "$totalStdPcs" },
          actualSlicedPcs: { $sum: "$actualSlicedPcs" },
          actualPacks: { $sum: "$actualPacks" },
          butal: { $sum: "$butal" },
          variance: { $sum: "$variance" },
          products: {
            $push: {
              mainProductName: "$_id.mainProductName",
              slicedProductName: "$_id.slicedProductName",
              standardPacking: "$_id.standardPacking",
              bags: "$bags",
              heads: "$heads",
              kilos: "$kilos",
              totalStdPcs: "$totalStdPcs",
              actualSlicedPcs: "$actualSlicedPcs",
              actualPacks: "$actualPacks",
              butal: "$butal",
              variance: "$variance",
              activityCount: "$activityCount",
            },
          },
        },
      },
      { $sort: { _id: -1 } }
    );

    const aggregated = await SlicingItemModel.aggregate(pipeline);

    const dailyRecords = aggregated.map((record: any) => {
      const uniqueBatchIds = new Set(
        (record.batchIds || []).flat().map((id: any) => id?.toString?.() || String(id))
      );
      const products = Array.isArray(record.products) ? record.products : [];
      const slicedProductNames = Array.from(
        new Set(products.map((product: any) => product.slicedProductName).filter(Boolean))
      );
      const mainProductNames = Array.from(
        new Set(products.map((product: any) => product.mainProductName).filter(Boolean))
      );

      return {
        _id: record._id,
        date: record._id,
        slicingDate: record.slicingDate
          ? new Date(record.slicingDate).toISOString()
          : record._id,
        transactionName: `Daily Slicing - ${record._id}`,
        mainProductName:
          mainProductNames.length === 1 ? mainProductNames[0] : `${mainProductNames.length} products`,
        slicedProductName:
          slicedProductNames.length === 1 ? slicedProductNames[0] : `${slicedProductNames.length} products`,
        batchCount: uniqueBatchIds.size,
        activityCount: toNumber(record.activityCount),
        bags: toNumber(record.bags),
        heads: toNumber(record.heads),
        kilos: toNumber(record.kilos),
        totalStdPcs: toNumber(record.totalStdPcs),
        actualSlicedPcs: toNumber(record.actualSlicedPcs),
        actualPacks: toNumber(record.actualPacks),
        butal: toNumber(record.butal),
        variance: toNumber(record.variance),
        slicers: uniqueClean(record.slicers || []),
        packers: uniqueClean(record.packers || []),
        products,
      };
    });

    const pagedRecords = dailyRecords.slice(skip, skip + limit);

    const summary = dailyRecords.reduce(
      (sum, record) => ({
        dayCount: sum.dayCount + 1,
        batchCount: sum.batchCount + record.batchCount,
        activityCount: sum.activityCount + record.activityCount,
        heads: sum.heads + record.heads,
        kilos: sum.kilos + record.kilos,
        totalStdPcs: sum.totalStdPcs + record.totalStdPcs,
        actualSlicedPcs: sum.actualSlicedPcs + record.actualSlicedPcs,
        actualPacks: sum.actualPacks + record.actualPacks,
        butal: sum.butal + record.butal,
        variance: sum.variance + record.variance,
      }),
      {
        dayCount: 0,
        batchCount: 0,
        activityCount: 0,
        heads: 0,
        kilos: 0,
        totalStdPcs: 0,
        actualSlicedPcs: 0,
        actualPacks: 0,
        butal: 0,
        variance: 0,
      }
    );

    return NextResponse.json(
      {
        success: true,
        data: pagedRecords,
        summary,
        meta: {
          page,
          limit,
          total: dailyRecords.length,
          totalPages: Math.max(Math.ceil(dailyRecords.length / limit), 1),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  }

  const batchFilter: Record<string, any> = {
    isVoided: false,
    ...buildDateFilter(dateFrom, dateTo),
  };

  const batches = await SlicingBatchModel.find(batchFilter).select("_id").lean();
  const batchIds = (batches as any[]).map((item) => item._id);

  const itemFilter: Record<string, any> = {
    batchId: { $in: batchIds },
  };

  if (slicedProductId && slicedProductId !== "ALL" && isValidObjectId(slicedProductId)) {
    itemFilter.slicedProductId = slicedProductId;
  }

  const [items, total] = await Promise.all([
    SlicingItemModel.find(itemFilter)
      .populate("batchId", "slicingDate slicer packer")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SlicingItemModel.countDocuments(itemFilter),
  ]);

  return NextResponse.json(
    {
      success: true,
      data: (items as any[]).map(serializeSlicingItem),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}

async function handlePOST(req: NextRequest) {
  const { response, session } = await requirePermission("slicing.manage");
  if (response) return response;

  await dbConnect();

  const body = await req.json();
  const slicingDate = cleanString(body.slicingDate);
  const slicer = cleanString(body.slicer);
  const packer = cleanString(body.packer);
  const rawItems: SlicingItemInput[] = Array.isArray(body.items)
    ? body.items
    : Array.isArray(body.records)
      ? body.records
      : Array.isArray(body.slicingItems)
        ? body.slicingItems
        : [];

  if (!slicingDate) {
    return NextResponse.json(
      { success: false, message: "Slicing date is required." },
      { status: 400 }
    );
  }

  if (!slicer) {
    return NextResponse.json(
      { success: false, message: "Slicer name is required." },
      { status: 400 }
    );
  }

  if (!packer) {
    return NextResponse.json(
      { success: false, message: "Packer name is required." },
      { status: 400 }
    );
  }

  if (rawItems.length === 0) {
    return NextResponse.json(
      { success: false, message: "At least one slicing item is required." },
      { status: 400 }
    );
  }

  let totalHeads = 0;
  let totalKilos = 0;
  let totalStdPcs = 0;
  let totalActualPcs = 0;
  let totalPacks = 0;
  let totalButal = 0;
  let totalVariance = 0;

  const preparedItems: any[] = [];

  for (const item of rawItems) {
    const standardId = cleanString(
      item.standardId || item.standardPackingId || item.slicingStandardId || ""
    );

    if (!standardId || !isValidObjectId(standardId)) {
      return NextResponse.json(
        { success: false, message: "Selected standard is invalid." },
        { status: 400 }
      );
    }

    const standard = await StandardPackingModel.findOne({
      _id: standardId,
      isActive: true,
    }).lean();

    if (!standard) {
      return NextResponse.json(
        { success: false, message: "Selected standard was not found." },
        { status: 404 }
      );
    }

    const [mainProduct, slicedProduct] = await Promise.all([
      BodegaProductModel.findOne({ _id: (standard as any).wholeChickenId, isActive: true }).lean(),
      BodegaProductModel.findOne({ _id: (standard as any).productId, isActive: true }).lean(),
    ]);

    if (!mainProduct || !slicedProduct) {
      return NextResponse.json(
        {
          success: false,
          message: "Bodega product connected to selected standard was not found.",
        },
        { status: 404 }
      );
    }

	    const bags = cleanNumber(item.bags);
	    const heads = cleanNumber(item.heads || item.qtyToSlice);
	    const kilos = cleanNumber(item.kilos);
	    const kilosPerBag = bags > 0 ? kilos / bags : kilos;
	    const actualSlicedPcs = cleanNumber(item.actualSlicedPcs);

	    if (heads <= 0) {
      return NextResponse.json(
        { success: false, message: "Heads must be greater than zero." },
	        { status: 400 }
	      );
	    }

	    if (!Number.isInteger(heads) || heads > MAX_HEADS_PER_ROW) {
	      return NextResponse.json(
	        {
	          success: false,
	          message: `Heads for ${(mainProduct as any).name} must be a whole number up to ${MAX_HEADS_PER_ROW}.`,
	        },
	        { status: 400 }
	      );
	    }

	    if (actualSlicedPcs <= 0) {
	      return NextResponse.json(
	        { success: false, message: "Actual sliced PCS must be greater than zero." },
	        { status: 400 }
	      );
	    }

	    if (!Number.isInteger(actualSlicedPcs)) {
	      return NextResponse.json(
	        {
	          success: false,
	          message: `Actual sliced PCS for ${(slicedProduct as any).name} must be a whole number.`,
	        },
	        { status: 400 }
	      );
	    }

	    if (bags > 0 && !Number.isInteger(bags)) {
	      return NextResponse.json(
	        {
	          success: false,
	          message: `Bags for ${(mainProduct as any).name} must be a whole number.`,
	        },
	        { status: 400 }
	      );
	    }

	    if (kilos > 0 && kilos / heads > MAX_KILOS_PER_HEAD) {
	      return NextResponse.json(
	        {
	          success: false,
	          message: `${(mainProduct as any).name} has ${formatNumber(kilos / heads)} kg/head. Please check the kilos or heads entry.`,
	        },
	        { status: 400 }
	      );
	    }

    const availableStock = toNumber((mainProduct as any).stockQty);
    if (heads > availableStock) {
      return NextResponse.json(
        {
          success: false,
          message: `${(mainProduct as any).name} has only ${availableStock} available stock. Cannot slice ${heads}.`,
        },
        { status: 400 }
      );
    }

    const standardSlice = toNumber((standard as any).standardSlice);
    const standardPacking = toNumber((standard as any).standardPacking);
    const minimumKilos = toNumber((standard as any).minimumKilos);
    const maximumKilos = toNumber((standard as any).maximumKilos);

    if (standardSlice <= 0 || standardPacking <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid standard values for ${(mainProduct as any).name} -> ${(slicedProduct as any).name}.`,
        },
        { status: 400 }
      );
    }

    const kiloIssue = getSlicingKiloIssue({
      bags,
      kilosPerBag,
      minimumKilosPerBag: minimumKilos,
      maximumKilosPerBag: maximumKilos,
    });

    if ((minimumKilos > 0 || maximumKilos > 0) && bags <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Bags for ${(mainProduct as any).name} must be greater than zero for a kg/bag standard.`,
        },
        { status: 400 }
      );
    }

    if (kiloIssue?.kind === "below-minimum") {
      return NextResponse.json(
        {
          success: false,
          message: `${(mainProduct as any).name} requires at least ${formatNumber(minimumKilos)} kg per bag (${bags} bags; minimum total ${formatNumber(kiloIssue.minimumTotalKilos)} kg).`,
        },
        { status: 400 }
      );
    }

    if (kiloIssue?.kind === "above-maximum") {
      return NextResponse.json(
        {
          success: false,
          message: `${(mainProduct as any).name} allows up to ${formatNumber(maximumKilos)} kg per bag (${bags} bags; maximum total ${formatNumber(kiloIssue.maximumTotalKilos)} kg).`,
        },
        { status: 400 }
      );
    }

	    const totalStd = heads * standardSlice;
	    const actualPacks = Math.floor(actualSlicedPcs / standardPacking);
	    const butal = actualSlicedPcs % standardPacking;
	    const variance = getSlicingVariance(actualSlicedPcs, totalStd);
	    const yieldRate = totalStd > 0 ? actualSlicedPcs / totalStd : 0;
      const inputUnitCost = toNumber((mainProduct as any).buyingPrice);
      const outputUnitPrice = toNumber((slicedProduct as any).sellingPrice);
      const inputCost = roundMoney(
        (kilos > 0 ? kilos : heads) * inputUnitCost
      );
      const outputValue = roundMoney(
        actualPacks * outputUnitPrice +
          butal * (standardPacking > 0 ? outputUnitPrice / standardPacking : 0)
      );
      const recoveryProfit = roundMoney(outputValue - inputCost);

	    if (
	      yieldRate < MIN_SLICING_YIELD_RATE ||
	      yieldRate > MAX_SLICING_YIELD_RATE
	    ) {
	      return NextResponse.json(
	        {
	          success: false,
	          message: `${(slicedProduct as any).name} yield is ${formatNumber(yieldRate * 100)}%. Expected range is ${formatNumber(MIN_SLICING_YIELD_RATE * 100, 0)}% to ${formatNumber(MAX_SLICING_YIELD_RATE * 100, 0)}%. Please recount before saving.`,
	        },
	        { status: 400 }
	      );
	    }

    totalHeads += heads;
    totalKilos += kilos;
    totalStdPcs += totalStd;
    totalActualPcs += actualSlicedPcs;
    totalPacks += actualPacks;
    totalButal += butal;
    totalVariance += variance;

    preparedItems.push({
      standardId: (standard as any)._id,
      mainProductId: (mainProduct as any)._id,
      slicedProductId: (slicedProduct as any)._id,
      mainProductName: (mainProduct as any).name,
      slicedProductName: (slicedProduct as any).name,
      bags,
      heads,
      kilos,
      minimumKilos,
      maximumKilos,
      standardSlice,
      standardPacking,
      totalStdPcs: totalStd,
      actualSlicedPcs,
      actualPacks,
      butal,
      variance,
      inputUnitCost,
      outputUnitPrice,
      inputCost,
      outputValue,
      recoveryProfit,
      recoveryRate: inputCost > 0 ? outputValue / inputCost : 0,
      yieldRate,
    });
  }

  const mongoSession = await mongoose.startSession();

  try {
    let batchId: any;

    await mongoSession.withTransaction(async () => {
      const [batch] = await SlicingBatchModel.create(
        [
          {
            slicingDate: new Date(slicingDate),
            slicer,
            packer,
            totalHeads,
            totalKilos,
            totalStdPcs,
            totalActualPcs,
            totalPacks,
            totalButal,
            totalVariance,
            createdBy: session?.user?.id,
          },
        ],
        { session: mongoSession }
      );

      batchId = batch._id;

      const slicingItemsToInsert = [];
      const stockTransactions = [];

      for (const item of preparedItems) {
        const updatedMainProduct = await BodegaProductModel.findOneAndUpdate(
          {
            _id: item.mainProductId,
            isActive: true,
            stockQty: { $gte: item.heads },
            stockBags: { $gte: item.bags },
            stockKilos: { $gte: item.kilos },
            stockHeads: { $gte: item.heads },
          },
          {
            $inc: {
              stockQty: -item.heads,
              stockBags: -item.bags,
              stockKilos: -item.kilos,
              stockHeads: -item.heads,
            },
          },
          { new: true, session: mongoSession }
        );

        if (!updatedMainProduct) {
          fail(
            400,
            `${item.mainProductName} does not have enough stock for slicing.`
          );
        }

        const mainNewStock = toNumber((updatedMainProduct as any).stockQty);
        const mainPreviousStock = mainNewStock + item.heads;

        const updatedSlicedProduct = await BodegaProductModel.findOneAndUpdate(
          {
            _id: item.slicedProductId,
            isActive: true,
          },
          { $inc: { stockQty: item.actualSlicedPcs } },
          { new: true, session: mongoSession }
        );

        if (!updatedSlicedProduct) {
          fail(404, `${item.slicedProductName} was not found.`);
        }

        const slicedNewStock = toNumber((updatedSlicedProduct as any).stockQty);
        const slicedPreviousStock = slicedNewStock - item.actualSlicedPcs;

        slicingItemsToInsert.push({
          batchId: batch._id,
          standardId: item.standardId,
          mainProductId: item.mainProductId,
          slicedProductId: item.slicedProductId,
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
          inputUnitCost: item.inputUnitCost,
          outputUnitPrice: item.outputUnitPrice,
          inputCost: item.inputCost,
          outputValue: item.outputValue,
          recoveryProfit: item.recoveryProfit,
          recoveryRate: item.recoveryRate,
          yieldRate: item.yieldRate,
        });

        stockTransactions.push(
          {
            bodegaProductId: item.mainProductId,
            type: "STOCK_OUT",
            quantity: item.heads,
            bags: item.bags,
            kilos: item.kilos,
            heads: item.heads,
            pieces: 0,
            previousStock: mainPreviousStock,
            newStock: mainNewStock,
            remarks: `SLICING OUT ${batch._id.toString()}`,
            referenceType: "SLICING_BATCH",
            referenceId: batch._id,
            createdBy: session?.user?.id,
          },
          {
            bodegaProductId: item.slicedProductId,
            type: "STOCK_IN",
            quantity: item.actualSlicedPcs,
            bags: 0,
            kilos: 0,
            heads: 0,
            pieces: item.actualSlicedPcs,
            previousStock: slicedPreviousStock,
            newStock: slicedNewStock,
            remarks: `SLICING IN ${batch._id.toString()}`,
            referenceType: "SLICING_BATCH",
            referenceId: batch._id,
            createdBy: session?.user?.id,
          }
        );
      }

      if (slicingItemsToInsert.length > 0) {
        await SlicingItemModel.insertMany(slicingItemsToInsert, {
          session: mongoSession,
        });
      }

      if (stockTransactions.length > 0) {
        await BodegaStockTransactionModel.insertMany(stockTransactions, {
          session: mongoSession,
        });
      }
    });

    return NextResponse.json(
      {
        success: true,
        message: "Slicing records saved successfully.",
        data: { _id: batchId?.toString?.() || String(batchId) },
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error(error);

    return NextResponse.json(
      { success: false, message: "Unable to save slicing records." },
      { status: 500 }
    );
  } finally {
    await mongoSession.endSession();
  }
}

export const POST = withAuditLog(handlePOST, {
  module: "SLICING",
  action: "CREATE",
  entityType: "SLICING_BATCH",
});
