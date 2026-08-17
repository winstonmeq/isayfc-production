import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { manilaDateString } from "@/lib/date-utils";
import { requirePermission } from "@/lib/require-permission";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import StandardPackingModel from "@/models/StandardPacking";
import SlicingItemModel from "@/models/SlicingItem";
import { packingSnapshot, toBaseUnitCost } from "@/lib/inventory-units";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function monthRange(value: string | null) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || "");
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) - 1 : now.getMonth();
  return {
    year,
    month,
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 1),
    days: new Date(year, month + 1, 0).getDate(),
  };
}

export async function GET(request: NextRequest) {
  const { response } = await requirePermission("reports.inventory");
  if (response) return response;
  await dbConnect();

  const { searchParams } = new URL(request.url);
  const range = monthRange(searchParams.get("month"));
  const products = await BodegaProductModel.find({ isActive: true })
    .select("name stockQty buyingPrice")
    .sort({ name: 1 })
    .lean<any[]>();
  const selected =
    products.find((product) => String(product._id) === searchParams.get("productId")) ||
    products[0];

  if (!selected) {
    return NextResponse.json({ success: true, products: [], rows: [] });
  }

  const transactions = await BodegaStockTransactionModel.find({
    bodegaProductId: selected._id,
    transactionDate: { $gte: range.start },
  })
    .select("transactionDate type previousStock newStock referenceType")
    .sort({ transactionDate: 1, _id: 1 })
    .lean<any[]>();

  const current = Number(selected.stockQty || 0);
  const deltaAfterStart = transactions.reduce(
    (sum, row) => sum + Number(row.newStock || 0) - Number(row.previousStock || 0),
    0
  );
  let running = current - deltaAfterStart;
  const rows = Array.from({ length: range.days }, (_, index) => {
    const day = index + 1;
    const beginning = running;
    let stockIn = 0;
    let stockOut = 0;
    let adjustment = 0;
    for (const transaction of transactions) {
      const at = new Date(transaction.transactionDate);
      if (at >= range.end || at.getDate() !== day) continue;
      const delta = Number(transaction.newStock || 0) - Number(transaction.previousStock || 0);
      if (transaction.type === "ADJUSTMENT") adjustment += delta;
      else if (delta >= 0) stockIn += delta;
      else stockOut += Math.abs(delta);
    }
    running = beginning + stockIn - stockOut + adjustment;
    return { day, beginning, stockIn, stockOut, adjustment, balance: running, actual: running };
  });

  const standard = await StandardPackingModel.findOne({
    productId: selected._id,
    isActive: true,
    standardPacking: { $gt: 0 },
  })
    .sort({ updatedAt: -1, _id: -1 })
    .select("standardPacking")
    .lean<any>();
  const packSize = Math.max(0, Math.trunc(Number(standard?.standardPacking || 0)));
  const recordedUnitCost = toBaseUnitCost(
    Number(selected.buyingPrice || 0),
    packingSnapshot({
      unit: packSize > 0 ? "PACK" : "HEAD",
      baseUnit: packSize > 0 ? "PCS" : "HEAD",
      multiplier: packSize,
    })
  );
  const slicedCost = await SlicingItemModel.aggregate<{ totalInputCost: number; totalOutputPcs: number }>([
    { $match: { slicedProductId: selected._id, actualSlicedPcs: { $gt: 0 }, inputCost: { $gt: 0 } } },
    { $lookup: { from: "slicingbatches", localField: "batchId", foreignField: "_id", as: "batch" } },
    { $unwind: "$batch" },
    { $match: { "batch.isVoided": { $ne: true } } },
    { $group: { _id: null, totalInputCost: { $sum: "$inputCost" }, totalOutputPcs: { $sum: "$actualSlicedPcs" } } },
  ]);
  const slicedUnitCost = slicedCost[0]?.totalOutputPcs > 0
    ? slicedCost[0].totalInputCost / slicedCost[0].totalOutputPcs
    : 0;
  const unitCost = recordedUnitCost > 0 ? recordedUnitCost : slicedUnitCost;
  return NextResponse.json({
    success: true,
    generatedAt: manilaDateString(),
    month: `${range.year}-${String(range.month + 1).padStart(2, "0")}`,
    products: products.map((product) => ({ id: String(product._id), name: product.name })),
    selectedProduct: { id: String(selected._id), name: selected.name },
    rows,
    totals: {
      stockIn: rows.reduce((sum, row) => sum + row.stockIn, 0),
      stockOut: rows.reduce((sum, row) => sum + row.stockOut, 0),
      adjustment: rows.reduce((sum, row) => sum + row.adjustment, 0),
      endingUnits: running,
      unitCost,
      unitLabel: packSize > 0 ? "PCS" : "HEAD",
      endingValue: running * unitCost,
    },
  });
}
