import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId, type PipelineStage } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { getSlicingVariance } from "@/lib/slicing-validation";
import BodegaProductModel from "@/models/BodegaProduct";
import SlicingItemModel from "@/models/SlicingItem";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AnyRecord = Record<string, any>;

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getDateRange(searchParams: URLSearchParams) {
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));
  const today = new Date().toISOString().slice(0, 10);
  const from = dateFrom || today;
  const to = dateTo || from;

  return {
    dateFrom: from,
    dateTo: to,
    startDate: new Date(`${from}T00:00:00.000Z`),
    endDate: new Date(`${to}T23:59:59.999Z`),
  };
}

function uniqueClean(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .flat(3)
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function serializeProduct(product: AnyRecord) {
  const standardPacking = Math.max(0, Math.trunc(toNumber(product.standardPacking)));
  const actualPcs = Math.max(0, Math.trunc(toNumber(product.actualSlicedPcs)));
  const actualPacks =
    standardPacking > 0 ? Math.floor(actualPcs / standardPacking) : toNumber(product.actualPacks);
  const loosePcs = standardPacking > 0 ? actualPcs % standardPacking : toNumber(product.butal);
  const totalStdPcs = toNumber(product.totalStdPcs);
  const yieldRate = totalStdPcs > 0 ? (actualPcs / totalStdPcs) * 100 : 0;

  return {
    mainProductName: product.mainProductName || "-",
    slicedProductName: product.slicedProductName || "-",
    standardSlice: toNumber(product.standardSlice),
    standardPacking,
    batchCount: toNumber(product.batchCount),
    activityCount: toNumber(product.activityCount),
    bags: toNumber(product.bags),
    heads: toNumber(product.heads),
    kilos: toNumber(product.kilos),
    totalStdPcs,
    actualSlicedPcs: actualPcs,
    actualPacks,
    butal: loosePcs,
    variance: getSlicingVariance(actualPcs, totalStdPcs),
    yieldRate,
  };
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(["slicing.view", "slicing.manage"]);
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo, startDate, endDate } = getDateRange(searchParams);
  const slicedProductId = cleanString(searchParams.get("slicedProductId"));
  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 31), 1), 100);
  const skip = (page - 1) * limit;

  const batchMatch: AnyRecord = {
    "batch.isVoided": false,
    "batch.slicingDate": {
      $gte: startDate,
      $lte: endDate,
    },
  };

  const itemMatch: AnyRecord = {};
  if (slicedProductId && slicedProductId !== "ALL" && isValidObjectId(slicedProductId)) {
    itemMatch.slicedProductId = new mongoose.Types.ObjectId(slicedProductId);
  }

  const pipeline: PipelineStage[] = [
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
          standardSlice: "$standardSlice",
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
        variance: { $sum: { $subtract: ["$actualSlicedPcs", "$totalStdPcs"] } },
      },
    },
    {
      $project: {
        _id: 0,
        day: "$_id.day",
        firstDate: 1,
        mainProductName: "$_id.mainProductName",
        slicedProductName: "$_id.slicedProductName",
        standardSlice: "$_id.standardSlice",
        standardPacking: "$_id.standardPacking",
        batchIds: 1,
        slicers: 1,
        packers: 1,
        activityCount: 1,
        bags: 1,
        heads: 1,
        kilos: 1,
        totalStdPcs: 1,
        actualSlicedPcs: 1,
        variance: 1,
      },
    },
    { $sort: { day: -1, slicedProductName: 1 } }
  );

  const productRows = await SlicingItemModel.aggregate<AnyRecord>(pipeline);
  const dayMap = new Map<string, AnyRecord>();

  for (const rawProduct of productRows) {
    const product = serializeProduct(rawProduct);
    const day = String(rawProduct.day || "");
    const current = dayMap.get(day) || {
      _id: day,
      date: day,
      slicingDate: rawProduct.firstDate ? new Date(rawProduct.firstDate).toISOString() : day,
      transactionName: `Daily Slicing - ${day}`,
      batchIds: new Set<string>(),
      slicers: new Set<string>(),
      packers: new Set<string>(),
      activityCount: 0,
      productCount: 0,
      bags: 0,
      heads: 0,
      kilos: 0,
      totalStdPcs: 0,
      actualSlicedPcs: 0,
      actualPacks: 0,
      butal: 0,
      variance: 0,
      products: [],
    };

    for (const id of rawProduct.batchIds || []) {
      current.batchIds.add(id?.toString?.() || String(id));
    }
    for (const slicer of uniqueClean(rawProduct.slicers || [])) current.slicers.add(slicer);
    for (const packer of uniqueClean(rawProduct.packers || [])) current.packers.add(packer);

    current.activityCount += product.activityCount;
    current.productCount += 1;
    current.bags += product.bags;
    current.heads += product.heads;
    current.kilos += product.kilos;
    current.totalStdPcs += product.totalStdPcs;
    current.actualSlicedPcs += product.actualSlicedPcs;
    current.actualPacks += product.actualPacks;
    current.butal += product.butal;
    current.variance += product.variance;
    current.products.push(product);

    dayMap.set(day, current);
  }

  const allRecords = Array.from(dayMap.values())
    .map((record) => {
      const yieldRate =
        record.totalStdPcs > 0 ? (record.actualSlicedPcs / record.totalStdPcs) * 100 : 0;

      return {
        _id: record._id,
        date: record.date,
        slicingDate: record.slicingDate,
        transactionName: record.transactionName,
        batchCount: record.batchIds.size,
        activityCount: record.activityCount,
        productCount: record.productCount,
        bags: record.bags,
        heads: record.heads,
        kilos: record.kilos,
        totalStdPcs: record.totalStdPcs,
        actualSlicedPcs: record.actualSlicedPcs,
        actualPacks: record.actualPacks,
        butal: record.butal,
        variance: record.variance,
        yieldRate,
        slicers: Array.from(record.slicers).sort(),
        packers: Array.from(record.packers).sort(),
        products: record.products.sort((a: AnyRecord, b: AnyRecord) =>
          String(a.slicedProductName).localeCompare(String(b.slicedProductName))
        ),
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const summary = allRecords.reduce(
    (sum, record) => ({
      dayCount: sum.dayCount + 1,
      batchCount: sum.batchCount + toNumber(record.batchCount),
      activityCount: sum.activityCount + toNumber(record.activityCount),
      productCount: sum.productCount + toNumber(record.productCount),
      bags: sum.bags + toNumber(record.bags),
      heads: sum.heads + toNumber(record.heads),
      kilos: sum.kilos + toNumber(record.kilos),
      totalStdPcs: sum.totalStdPcs + toNumber(record.totalStdPcs),
      actualSlicedPcs: sum.actualSlicedPcs + toNumber(record.actualSlicedPcs),
      actualPacks: sum.actualPacks + toNumber(record.actualPacks),
      butal: sum.butal + toNumber(record.butal),
      variance: sum.variance + toNumber(record.variance),
    }),
    {
      dayCount: 0,
      batchCount: 0,
      activityCount: 0,
      productCount: 0,
      bags: 0,
      heads: 0,
      kilos: 0,
      totalStdPcs: 0,
      actualSlicedPcs: 0,
      actualPacks: 0,
      butal: 0,
      variance: 0,
    }
  );

  const summaryWithYield = {
    ...summary,
    yieldRate: summary.totalStdPcs > 0 ? (summary.actualSlicedPcs / summary.totalStdPcs) * 100 : 0,
  };

  const products = await BodegaProductModel.find({ isActive: true })
    .select("name")
    .sort({ name: 1 })
    .lean();

  return NextResponse.json(
    {
      success: true,
      filters: {
        dateFrom,
        dateTo,
        slicedProductId: slicedProductId || "ALL",
      },
      data: allRecords.slice(skip, skip + limit),
      summary: summaryWithYield,
      products: (products as AnyRecord[]).map((product) => ({
        _id: product._id.toString(),
        name: product.name,
      })),
      meta: {
        page,
        limit,
        total: allRecords.length,
        totalPages: Math.max(Math.ceil(allRecords.length / limit), 1),
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
