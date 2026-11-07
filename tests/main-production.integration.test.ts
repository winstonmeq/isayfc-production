import test from "node:test";
import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";
import { randomUUID } from "node:crypto";
import Product from "../models/Product";
import Bodega from "../models/BodegaProduct";
import Batch from "../models/MainProductionBatch";
import GroceryLedger from "../models/InventoryTransaction";
import BodegaLedger from "../models/BodegaStockTransaction";
import { manilaDateString } from "../lib/date-utils";

const uri = process.env.TEST_MONGODB_URI, baseUrl = process.env.TEST_POS_BASE_URL, cookie = process.env.TEST_POS_ADMIN_COOKIE;
test("main production deducts chicken and ingredients, adds finished KG, retries once and rolls back shortages", {
  skip: !uri || !baseUrl || !cookie ? "Requires dedicated local test server, test database and ADMIN cookie" : false,
}, async () => {
  assert.match(new URL(uri!.replace(/^mongodb\+srv:/, "https:").replace(/^mongodb:/, "http:")).pathname, /test/i);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl!).hostname));
  await mongoose.connect(uri!);
  const chickenId = new Types.ObjectId(), ingredientId = new Types.ObjectId(), outputId = new Types.ObjectId(), categoryId = new Types.ObjectId();
  const key = randomUUID();
  async function post(body: object, expected: number, path = "/api/main-production") {
    const response = await fetch(new URL(path, baseUrl), { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie! }, body: JSON.stringify(body), redirect: "error" });
    const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
  }
  const request = { requestKey: key, productionDate: manilaDateString(), outputProductId: String(outputId), outputKilos: 12, ingredients: [{ type: "BODEGA", id: String(chickenId), quantity: 10, kilos: 15 }, { type: "GROCERY", id: String(ingredientId), quantity: 3 }] };
  try {
    await Bodega.create({ _id: chickenId, name: `TEST-${key}`, unitCode: "HEAD", stockQty: 20, stockHeads: 20, stockKilos: 30, buyingPrice: 150 });
    await Product.create({ _id: ingredientId, name: `TEST-ING-${key}`, categoryId, unitCode: "KG", stockPcs: 6, buyingPrice: 150 });
    await Bodega.create({ _id: outputId, name: `TEST-OUT-${key}`, categoryId, unitCode: "KG", stockQty: 0, stockKilos: 0, buyingPrice: 0, sellingPrice: 300 });
    const options = await fetch(new URL("/api/main-production", baseUrl), { headers: { Cookie: cookie! } });
    const directory = await options.json();
    assert.ok(directory.outputs.some((p: { id: string }) => p.id === String(outputId)));
    assert.ok(!directory.outputs.some((p: { id: string }) => p.id === String(ingredientId)));
    const first = await post(request, 200);
    assert.equal(first.data.totalCost, 2700); assert.equal(first.data.costPerKilo, 225);
    await post(request, 200);
    const chicken = await Bodega.findById(chickenId).orFail();
    assert.equal(chicken.stockQty, 10); assert.equal(chicken.stockHeads, 10); assert.equal(chicken.stockKilos, 15);
    assert.equal((await Product.findById(ingredientId).orFail()).stockPcs, 3);
    const output = await Bodega.findById(outputId).orFail(); assert.equal(output.stockQty, 12); assert.equal(output.stockKilos, 12); assert.equal(output.buyingPrice, 225);
    await post({ ...request, requestKey: randomUUID(), ingredients: [{ type: "BODEGA", id: String(chickenId), quantity: 1, kilos: 1.5 }, { type: "GROCERY", id: String(ingredientId), quantity: 1000 }] }, 409);
    assert.equal((await Bodega.findById(chickenId).orFail()).stockQty, 10);
    assert.equal((await Bodega.findById(outputId).orFail()).stockQty, 12);
    assert.equal(await Batch.countDocuments({ requestKey: key }), 1);
    assert.equal(await BodegaLedger.countDocuments({ bodegaProductId: chickenId }), 1);
    const reversePath = `/api/main-production/${first.data._id}/reverse`;
    await post({ reason: "Test batch reversal" }, 200, reversePath);
    await post({ reason: "Retry test reversal" }, 200, reversePath);
    assert.equal((await Bodega.findById(chickenId).orFail()).stockHeads, 20);
    assert.equal((await Bodega.findById(chickenId).orFail()).stockKilos, 30);
    assert.equal((await Product.findById(ingredientId).orFail()).stockPcs, 6);
    assert.equal((await Bodega.findById(outputId).orFail()).stockQty, 0);
    assert.equal((await Batch.findOne({ requestKey: key }).orFail()).status, "REVERSED");
    assert.equal(await BodegaLedger.countDocuments({ bodegaProductId: chickenId }), 2);
  } finally {
    await Batch.deleteMany({ requestKey: key });
    await BodegaLedger.deleteMany({ bodegaProductId: { $in: [chickenId, outputId] } });
    await GroceryLedger.deleteMany({ productId: { $in: [ingredientId, outputId] } });
    await Bodega.deleteMany({ _id: { $in: [chickenId, outputId] } }); await Product.deleteOne({ _id: ingredientId });
    await mongoose.disconnect();
  }
});
