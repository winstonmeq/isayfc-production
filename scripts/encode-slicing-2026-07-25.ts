// One-time, idempotent encoder for the July 25, 2026 legacy slicing image.
// The already-entered OS4 -> C10 row (45 heads / 1,650 PCS) is intentionally excluded.
//
// Usage:
//   npm run encode:slicing-2026-07-25

import dotenv from "dotenv";
import path from "node:path";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const SLICER = "CLARENCE";
const PACKER = "CLARENCE";
const OUTPUT_PRODUCT = "C10";

const JULY_25_ITEMS = [
  { main: "OS3", heads: 15, actualPcs: 450, kilos: 20.3, bags: 1, standardSlice: 31 },
  { main: "C1", heads: 60, actualPcs: 1500, kilos: 69.8, bags: 4, standardSlice: 24 },
  { main: "OS4", heads: 75, actualPcs: 2850, kilos: 110.6, bags: 5, standardSlice: 36 },
  { main: "C2", heads: 15, actualPcs: 400, kilos: 16.55, bags: 1, standardSlice: 24 },
  { main: "OS4", heads: 135, actualPcs: 4950, kilos: 197.1, bags: 9, standardSlice: 36 },
  { main: "C1", heads: 64, actualPcs: 1650, kilos: 76.1, bags: 5, standardSlice: 24 },
  { main: "C2", heads: 30, actualPcs: 850, kilos: 37.45, bags: 2, standardSlice: 24 },
  { main: "C1", heads: 75, actualPcs: 2050, kilos: 89.95, bags: 5, standardSlice: 24 },
  { main: "C1", heads: 30, actualPcs: 850, kilos: 35.9, bags: 2, standardSlice: 24 },
  { main: "OS4", heads: 45, actualPcs: 1600, kilos: 67.25, bags: 3, standardSlice: 36 },
] as const;

const JULY_28_ITEMS = [
  { main: "OS2", heads: 12, actualPcs: 400, kilos: 15.25, bags: 1, standardSlice: 31 },
  { main: "PS4", heads: 30, actualPcs: 650, kilos: 31.49, bags: 2, standardSlice: 24 },
  { main: "OS1", heads: 48, actualPcs: 1350, kilos: 54.83, bags: 4, standardSlice: 28 },
  { main: "OS1", heads: 12, actualPcs: 350, kilos: 13.58, bags: 1, standardSlice: 28 },
  { main: "OS4", heads: 36, actualPcs: 1300, kilos: 51.72, bags: 3, standardSlice: 36 },
  { main: "OS3", heads: 36, actualPcs: 1150, kilos: 48.77, bags: 3, standardSlice: 31 },
  { main: "OS3", heads: 24, actualPcs: 800, kilos: 32.24, bags: 2, standardSlice: 31 },
  { main: "OS4", heads: 60, actualPcs: 2100, kilos: 87.38, bags: 5, standardSlice: 36 },
  { main: "C2-OS", heads: 60, actualPcs: 1500, kilos: 69.36, bags: 4, standardSlice: 24 },
  { main: "PS4", heads: 30, actualPcs: 750, kilos: 31.52, bags: 2, standardSlice: 24 },
  { main: "OS1", heads: 12, actualPcs: 350, kilos: 13.73, bags: 1, standardSlice: 28 },
  { main: "OS2", heads: 48, actualPcs: 1500, kilos: 59.35, bags: 4, standardSlice: 31 },
  { main: "OS2", heads: 12, actualPcs: 350, kilos: 14.91, bags: 1, standardSlice: 31 },
  { main: "OS4", heads: 12, actualPcs: 400, kilos: 17.24, bags: 1, standardSlice: 36 },
  { main: "C2-OS", heads: 30, actualPcs: 750, kilos: 34.72, bags: 2, standardSlice: 24 },
  { main: "OS1", heads: 48, actualPcs: 1400, kilos: 54.86, bags: 4, standardSlice: 28 },
  { main: "OS4", heads: 12, actualPcs: 450, kilos: 17.8, bags: 1, standardSlice: 36 },
  { main: "OS2", heads: 12, actualPcs: 350, kilos: 14.79, bags: 1, standardSlice: 31 },
  { main: "OS3", heads: 12, actualPcs: 400, kilos: 16.1, bags: 1, standardSlice: 31 },
  { main: "OS1", heads: 72, actualPcs: 1900, kilos: 83.1, bags: 6, standardSlice: 28 },
  { main: "OS1", heads: 36, actualPcs: 1000, kilos: 41.2, bags: 3, standardSlice: 28 },
  { main: "OS2", heads: 24, actualPcs: 800, kilos: 30.07, bags: 2, standardSlice: 31 },
  { main: "PS4", heads: 60, actualPcs: 1400, kilos: 63.21, bags: 4, standardSlice: 24 },
] as const;

const isJuly28 = process.argv.includes("--july-28");
const ITEMS = isJuly28 ? JULY_28_ITEMS : JULY_25_ITEMS;
const DATE_TEXT = isJuly28 ? "2026-07-28" : "2026-07-25";
const SLICING_DATE = new Date(`${DATE_TEXT}T00:00:00.000Z`);

const STANDARD_PACKING = 50;

function round(value: number) {
  return Math.round(value * 100) / 100;
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error(
      "Refusing to encode without --confirm. Usage: npm run encode:slicing-2026-07-25"
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured.");

  const totals = ITEMS.reduce(
    (sum, item) => {
      const standardPcs = item.heads * item.standardSlice;
      return {
        heads: sum.heads + item.heads,
        kilos: sum.kilos + item.kilos,
        standardPcs: sum.standardPcs + standardPcs,
        actualPcs: sum.actualPcs + item.actualPcs,
        packs: sum.packs + Math.floor(item.actualPcs / STANDARD_PACKING),
        loose: sum.loose + (item.actualPcs % STANDARD_PACKING),
        variance: sum.variance + item.actualPcs - standardPcs,
        bags: sum.bags + item.bags,
      };
    },
    { heads: 0, kilos: 0, standardPcs: 0, actualPcs: 0, packs: 0, loose: 0, variance: 0, bags: 0 }
  );
  totals.kilos = round(totals.kilos);

  const expected = isJuly28
    ? { heads: 738, kilos: 897.22, standardPcs: 21324, actualPcs: 21400, packs: 428, loose: 0, variance: 76, bags: 58 }
    : { heads: 544, kilos: 721, standardPcs: 16221, actualPcs: 17150, packs: 343, loose: 0, variance: 929, bags: 37 };
  if (Object.entries(expected).some(([key, value]) => totals[key as keyof typeof totals] !== value)) {
    throw new Error(`Slicing totals do not match the ${DATE_TEXT} source image.`);
  }

  await mongoose.connect(uri);
  const { default: BodegaProductModel } = await import("../models/BodegaProduct");
  const { default: StandardPackingModel } = await import("../models/StandardPacking");
  const { default: SlicingBatchModel } = await import("../models/SlicingBatch");
  const { default: SlicingItemModel } = await import("../models/SlicingItem");
  const { default: BodegaStockTransactionModel } = await import(
    "../models/BodegaStockTransaction"
  );

  const duplicateQuery = {
    slicingDate: SLICING_DATE,
    slicer: SLICER,
    packer: PACKER,
    totalHeads: totals.heads,
    totalKilos: totals.kilos,
    totalStdPcs: totals.standardPcs,
    totalActualPcs: totals.actualPcs,
    totalPacks: totals.packs,
    totalVariance: totals.variance,
    isVoided: false,
  };
  if (await SlicingBatchModel.exists(duplicateQuery)) {
    throw new Error(`This ${ITEMS.length}-row slicing import already exists. No changes made.`);
  }

  const names = [...new Set([...ITEMS.map((item) => item.main), OUTPUT_PRODUCT])];
  const products = await BodegaProductModel.find({ name: { $in: names }, isActive: true }).lean();
  const productsByName = new Map(products.map((product) => [product.name, product]));
  const missing = names.filter((name) => !productsByName.has(name));
  if (missing.length) throw new Error(`Missing active Bodega Products: ${missing.join(", ")}`);

  const output = productsByName.get(OUTPUT_PRODUCT)!;
  const standards = new Map<string, any>();
  for (const item of ITEMS) {
    if (standards.has(item.main)) continue;
    const mainProduct = productsByName.get(item.main)!;
    const matches = await StandardPackingModel.find({
      wholeChickenId: mainProduct._id,
      productId: output._id,
      standardPacking: STANDARD_PACKING,
      standardSlice: item.standardSlice,
      isActive: true,
    }).lean();
    const namedMatches = matches.filter(
      (match) => String(match.chickenSizeType || "").trim().toUpperCase() === item.main
    );
    const selectedStandard = matches.length === 1
      ? matches[0]
      : namedMatches.length === 1
        ? namedMatches[0]
        : null;
    if (!selectedStandard) {
      throw new Error(
        `Expected one active ${item.main} -> ${OUTPUT_PRODUCT} standard, found ${matches.length}: ` +
          matches.map((match) =>
            `${match._id} (${Number(match.minimumKilos || 0)}-${Number(match.maximumKilos || 0)} kg, ${String(match.chickenSizeType || "no size")})`
          ).join(", ")
      );
    }
    standards.set(item.main, selectedStandard);
  }

  const requiredByProduct = new Map<string, { heads: number; bags: number; kilos: number }>();
  for (const item of ITEMS) {
    const current = requiredByProduct.get(item.main) || { heads: 0, bags: 0, kilos: 0 };
    current.heads += item.heads;
    current.bags += item.bags;
    current.kilos = round(current.kilos + item.kilos);
    requiredByProduct.set(item.main, current);
  }
  for (const [name, required] of requiredByProduct) {
    const product = productsByName.get(name)!;
    if (
      Number(product.stockQty || 0) < required.heads ||
      Number(product.stockHeads || 0) < required.heads ||
      Number(product.stockBags || 0) < required.bags ||
      Number(product.stockKilos || 0) + 0.0001 < required.kilos
    ) {
      throw new Error(`${name} does not have enough stock for this slicing import.`);
    }
  }

  const mongoSession = await mongoose.startSession();
  let batchId = "";
  try {
    await mongoSession.withTransaction(async () => {
      if (await SlicingBatchModel.exists(duplicateQuery).session(mongoSession)) {
        throw new Error("This slicing import was created by another process. No changes made.");
      }

      const [batch] = await SlicingBatchModel.create(
        [{
          slicingDate: SLICING_DATE,
          slicer: SLICER,
          packer: PACKER,
          totalHeads: totals.heads,
          totalKilos: totals.kilos,
          totalStdPcs: totals.standardPcs,
          totalActualPcs: totals.actualPcs,
          totalPacks: totals.packs,
          totalButal: totals.loose,
          totalVariance: totals.variance,
        }],
        { session: mongoSession }
      );
      batchId = batch._id.toString();

      for (const item of ITEMS) {
        const main = productsByName.get(item.main)!;
        const standard = standards.get(item.main);
        const totalStdPcs = item.heads * item.standardSlice;
        const actualPacks = Math.floor(item.actualPcs / STANDARD_PACKING);
        const butal = item.actualPcs % STANDARD_PACKING;
        const variance = item.actualPcs - totalStdPcs;
        const inputUnitCost = Number(main.buyingPrice || 0);
        const outputUnitPrice = Number(output.sellingPrice || 0);
        const inputCost = round(item.kilos * inputUnitCost);
        const outputValue = round(
          actualPacks * outputUnitPrice + butal * (outputUnitPrice / STANDARD_PACKING)
        );
        const recoveryProfit = round(outputValue - inputCost);

        const updatedMain = await BodegaProductModel.findOneAndUpdate(
          {
            _id: main._id,
            isActive: true,
            stockQty: { $gte: item.heads },
            stockHeads: { $gte: item.heads },
            stockBags: { $gte: item.bags },
            stockKilos: { $gte: item.kilos - 0.0001 },
          },
          {
            $inc: {
              stockQty: -item.heads,
              stockHeads: -item.heads,
              stockBags: -item.bags,
              stockKilos: -item.kilos,
            },
          },
          { new: true, session: mongoSession }
        );
        if (!updatedMain) throw new Error(`${item.main} stock changed during import.`);

        const updatedOutput = await BodegaProductModel.findByIdAndUpdate(
          output._id,
          { $inc: { stockQty: item.actualPcs } },
          { new: true, session: mongoSession }
        );
        if (!updatedOutput) throw new Error(`${OUTPUT_PRODUCT} disappeared during import.`);

        await SlicingItemModel.create(
          [{
            batchId: batch._id,
            standardId: standard._id,
            mainProductId: main._id,
            slicedProductId: output._id,
            mainProductName: item.main,
            slicedProductName: OUTPUT_PRODUCT,
            bags: item.bags,
            heads: item.heads,
            kilos: item.kilos,
            minimumKilos: standard.minimumKilos,
            maximumKilos: standard.maximumKilos,
            standardSlice: item.standardSlice,
            standardPacking: STANDARD_PACKING,
            totalStdPcs,
            actualSlicedPcs: item.actualPcs,
            actualPacks,
            butal,
            variance,
            inputUnitCost,
            outputUnitPrice,
            inputCost,
            outputValue,
            varianceValue: round(variance * (outputUnitPrice / STANDARD_PACKING)),
            recoveryProfit,
            recoveryRate: inputCost > 0 ? outputValue / inputCost : 0,
            yieldRate: totalStdPcs > 0 ? item.actualPcs / totalStdPcs : 0,
          }],
          { session: mongoSession }
        );

        const mainNewStock = Number(updatedMain.stockQty || 0);
        const outputNewStock = Number(updatedOutput.stockQty || 0);
        await BodegaStockTransactionModel.insertMany(
          [
            {
              bodegaProductId: main._id,
              type: "STOCK_OUT",
              quantity: item.heads,
              bags: item.bags,
              kilos: item.kilos,
              heads: item.heads,
              pieces: 0,
              previousStock: mainNewStock + item.heads,
              newStock: mainNewStock,
              remarks: `SLICING OUT ${batch._id.toString()}`,
              referenceType: "SLICING_BATCH",
              referenceId: batch._id,
            },
            {
              bodegaProductId: output._id,
              type: "STOCK_IN",
              quantity: item.actualPcs,
              bags: 0,
              kilos: 0,
              heads: 0,
              pieces: item.actualPcs,
              previousStock: outputNewStock - item.actualPcs,
              newStock: outputNewStock,
              remarks: `SLICING IN ${batch._id.toString()}`,
              referenceType: "SLICING_BATCH",
              referenceId: batch._id,
            },
          ],
          { session: mongoSession }
        );
      }
    });
  } finally {
    await mongoSession.endSession();
  }

  console.log(`Database: ${mongoose.connection.db?.databaseName || "unknown"}`);
  console.log(`Slicing batch ID: ${batchId}`);
  console.log(`Date: ${DATE_TEXT} | Slicer: ${SLICER} | Packer: ${PACKER}`);
  console.log(`Rows inserted: ${ITEMS.length}${isJuly28 ? " (source rows 1 and 2 excluded)" : " (row 7 excluded)"}`);
  console.log(
    `Totals: ${totals.heads} heads | ${totals.kilos.toFixed(2)} kilos | ${totals.actualPcs} actual PCS | ${totals.packs} packs | variance ${totals.variance}`
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
