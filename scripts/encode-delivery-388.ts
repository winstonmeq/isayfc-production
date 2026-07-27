// One-time, idempotent encoder for Delivery 388 / Receipt 14719.
//
// Usage:
//   npm run encode:delivery-388

import dotenv from "dotenv";
import path from "node:path";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DELIVERY = {
  supplierName: "JARRY VEE",
  deliveryCode: "388",
  receiptNumber: "14719",
  deliveryDate: new Date("2026-07-25T00:00:00.000Z"),
  remarks: "ENCODED FROM DELIVERY IMAGE",
  items: [
    { productName: "C1", bags: 16, kilos: 272.25, pieces: 229, buyingPrice: 150 },
    { productName: "C2", bags: 3, kilos: 54, pieces: 45, buyingPrice: 150 },
    { productName: "OS3", bags: 1, kilos: 20.3, pieces: 15, buyingPrice: 152 },
    { productName: "OS4", bags: 20, kilos: 442.36, pieces: 300, buyingPrice: 152 },
    { productName: "PS4", bags: 4, kilos: 63.3, pieces: 60, buyingPrice: 154 },
  ],
} as const;

function money(value: number) {
  return Math.round(value * 100) / 100;
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error(
      "Refusing to encode without --confirm. Usage: npm run encode:delivery-388"
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured.");

  const totalBags = DELIVERY.items.reduce((sum, item) => sum + item.bags, 0);
  const totalKilos = DELIVERY.items.reduce((sum, item) => sum + item.kilos, 0);
  const totalPieces = DELIVERY.items.reduce((sum, item) => sum + item.pieces, 0);
  const totalAmount = money(
    DELIVERY.items.reduce(
      (sum, item) => sum + item.kilos * item.buyingPrice,
      0
    )
  );

  if (
    totalBags !== 44 ||
    money(totalKilos) !== 852.21 ||
    totalPieces !== 649 ||
    totalAmount !== 129010.02
  ) {
    throw new Error("Delivery totals do not match the source image.");
  }

  await mongoose.connect(uri);
  const { default: SupplierModel } = await import("../models/Supplier");
  const { default: BodegaProductModel } = await import(
    "../models/BodegaProduct"
  );
  const { default: BodegaStockTransactionModel } = await import(
    "../models/BodegaStockTransaction"
  );
  const { default: DeliveryModel } = await import("../models/Delivery");
  const { default: DeliveryItemModel } = await import("../models/DeliveryItem");

  const existing = await DeliveryModel.findOne({
    $or: [
      { deliveryCode: DELIVERY.deliveryCode },
      { receiptNumber: DELIVERY.receiptNumber },
    ],
    isVoided: false,
  }).lean();
  if (existing) {
    throw new Error(
      `Delivery already exists (code ${existing.deliveryCode}, receipt ${existing.receiptNumber}). No changes made.`
    );
  }

  const supplierMatches = await SupplierModel.find({
    name: DELIVERY.supplierName,
    isActive: true,
  })
    .select("_id name")
    .lean();
  if (supplierMatches.length !== 1) {
    throw new Error(
      supplierMatches.length === 0
        ? `Active supplier not found: ${DELIVERY.supplierName}`
        : `Multiple active suppliers found: ${DELIVERY.supplierName}`
    );
  }

  const productNames = DELIVERY.items.map((item) => item.productName);
  const products = await BodegaProductModel.find({
    name: { $in: productNames },
    isActive: true,
  })
    .select("_id name stockQty")
    .lean();
  const productsByName = new Map(
    products.map((product) => [String(product.name), product])
  );
  const missingProducts = productNames.filter(
    (name) => !productsByName.has(name)
  );
  if (missingProducts.length > 0) {
    throw new Error(
      `Missing active Bodega Products: ${missingProducts.join(", ")}`
    );
  }

  const mongoSession = await mongoose.startSession();
  let deliveryId = "";

  try {
    await mongoSession.withTransaction(async () => {
      const duplicate = await DeliveryModel.exists({
        $or: [
          { deliveryCode: DELIVERY.deliveryCode },
          { receiptNumber: DELIVERY.receiptNumber },
        ],
        isVoided: false,
      }).session(mongoSession);
      if (duplicate) {
        throw new Error("Delivery was created by another process. No changes made.");
      }

      const [delivery] = await DeliveryModel.create(
        [
          {
            supplierId: supplierMatches[0]._id,
            deliveryCode: DELIVERY.deliveryCode,
            receiptNumber: DELIVERY.receiptNumber,
            totalBags,
            totalKilos: money(totalKilos),
            totalPieces,
            totalAmount,
            deliveryDate: DELIVERY.deliveryDate,
            remarks: DELIVERY.remarks,
          },
        ],
        { session: mongoSession }
      );
      deliveryId = delivery._id.toString();

      for (const item of DELIVERY.items) {
        const product = productsByName.get(item.productName)!;
        const updatedProduct = await BodegaProductModel.findByIdAndUpdate(
          product._id,
          {
            $inc: {
              stockQty: item.pieces,
              stockBags: item.bags,
              stockKilos: item.kilos,
              stockHeads: item.pieces,
            },
            $set: { buyingPrice: item.buyingPrice },
          },
          { new: true, session: mongoSession }
        );
        if (!updatedProduct) {
          throw new Error(`Bodega Product disappeared: ${item.productName}`);
        }

        const lineTotal = money(item.kilos * item.buyingPrice);
        await DeliveryItemModel.create(
          [
            {
              deliveryId: delivery._id,
              productId: product._id,
              productName: item.productName,
              bags: item.bags,
              kilos: item.kilos,
              pieces: item.pieces,
              buyingPrice: item.buyingPrice,
              lineTotal,
            },
          ],
          { session: mongoSession }
        );

        const newStock = Number(updatedProduct.stockQty || 0);
        await BodegaStockTransactionModel.create(
          [
            {
              bodegaProductId: product._id,
              type: "STOCK_IN",
              quantity: item.pieces,
              bags: item.bags,
              kilos: item.kilos,
              heads: item.pieces,
              pieces: 0,
              previousStock: newStock - item.pieces,
              newStock,
              remarks: `DELIVERY ${DELIVERY.deliveryCode}`,
              referenceType: "DELIVERY",
              referenceId: delivery._id,
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
  console.log(`Delivery created: ${DELIVERY.deliveryCode}`);
  console.log(`Receipt: ${DELIVERY.receiptNumber}`);
  console.log(`Delivery ID: ${deliveryId}`);
  console.log(`Supplier: ${DELIVERY.supplierName}`);
  console.log(`Items: ${DELIVERY.items.length}`);
  console.log(`Totals: ${totalBags} bags | ${money(totalKilos)} kilos | ${totalPieces} pieces | PHP ${totalAmount.toFixed(2)}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
