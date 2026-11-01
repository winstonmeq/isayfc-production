import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { manilaDateString } from "../lib/date-utils";
import Outlet from "../models/Outlet";
import Customer from "../models/Customer";
import BodegaProduct from "../models/BodegaProduct";
import BodegaStockTransaction from "../models/BodegaStockTransaction";
import Sale from "../models/Sale";
import SaleLine from "../models/SaleLine";
import StockTransfer from "../models/StockTransfer";
import StockTransferItem from "../models/StockTransferItem";
import OutletInventory from "../models/OutletInventory";
import Expense from "../models/Expense";

const uri = process.env.TEST_MONGODB_URI;
const baseUrl = process.env.TEST_POS_BASE_URL;
const cookie = process.env.TEST_POS_ADMIN_COOKIE;

test("saving an outlet sale dispatches once; failed dispatch rolls back the entire sale", {
  skip: !uri || !baseUrl || !cookie ? "Requires dedicated test database, local server, and admin cookie" : false,
}, async () => {
  const parsed = new URL(uri!.replace(/^mongodb\+srv:/, "https:").replace(/^mongodb:/, "http:"));
  assert.match(parsed.pathname, /test/i);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl!).hostname));
  await mongoose.connect(uri!);
  const outletId = new mongoose.Types.ObjectId(), customerId = new mongoose.Types.ObjectId(), productId = new mongoose.Types.ObjectId();
  const prefix = `TEST-AUTO-${randomUUID()}`;
  async function save(receipt: string, quantities: number[], status: number) {
    const response = await fetch(new URL("/api/sales", baseUrl), { method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json", Cookie: cookie! },
      body: JSON.stringify({ source: "CHICKEN", customerId, saleDate: manilaDateString(), receiptNumber: receipt,
        items: quantities.map((qty) => ({ bodegaProductId: productId, qty })) }) });
    const json = await response.json();
    assert.equal(response.status, status, JSON.stringify(json));
    return json;
  }
  try {
    await Outlet.create({ _id: outletId, name: prefix, code: prefix });
    await Customer.create({ _id: customerId, name: prefix, outletId });
    // No pack recipe: a whole chicken is sold in HEAD, one stock unit each.
    await BodegaProduct.create({ _id: productId, name: prefix, stockQty: 50, stockHeads: 50, buyingPrice: 6, sellingPrice: 10 });
    // Each row is individually available, but together exceed stock. Neither
    // the first deduction, sale, lines, nor delivery may survive the failure.
    await save(`${prefix}-FAIL`, [30, 30], 400);
    assert.equal((await BodegaProduct.findById(productId).orFail()).stockQty, 50);
    assert.equal(await Sale.countDocuments({ customerId }), 0);
    assert.equal(await StockTransfer.countDocuments({ outletId }), 0);
    assert.equal(await BodegaStockTransaction.countDocuments({ bodegaProductId: productId }), 0);

    const result = await save(`${prefix}-OK`, [2], 201);
    const sale = await Sale.findById(result.data._id).orFail();
    const transfer = await StockTransfer.findOne({ saleId: sale._id }).orFail();
    assert.equal(transfer.status, "IN_TRANSIT");
    assert.ok(transfer.dispatchedAt);
    assert.equal((await BodegaProduct.findById(productId).orFail()).stockQty, 48);
    assert.equal(sale.fulfillmentStatus, "PENDING");
    assert.equal(sale.balance, 0);
    assert.equal(await Expense.countDocuments({ linkedSaleId: sale._id }), 0);
    assert.equal(await OutletInventory.countDocuments({ outletId }), 0);
    assert.equal(await BodegaStockTransaction.countDocuments({ referenceId: transfer._id }), 1);
    const retry = await fetch(new URL(`/api/stock-transfers/${transfer._id}/dispatch`, baseUrl), { method: "POST", headers: { Cookie: cookie! }, redirect: "error" });
    assert.equal(retry.status, 400);
    assert.equal((await BodegaProduct.findById(productId).orFail()).stockQty, 48);
  } finally {
    const sales = await Sale.find({ customerId }).select("_id");
    const transfers = await StockTransfer.find({ outletId }).select("_id");
    await SaleLine.deleteMany({ saleId: { $in: sales.map((sale) => sale._id) } });
    await StockTransferItem.deleteMany({ transferId: { $in: transfers.map((transfer) => transfer._id) } });
    await StockTransfer.deleteMany({ outletId });
    await Sale.deleteMany({ customerId });
    await BodegaStockTransaction.deleteMany({ bodegaProductId: productId });
    await BodegaProduct.deleteOne({ _id: productId });
    await Customer.deleteOne({ _id: customerId });
    await Outlet.deleteOne({ _id: outletId });
    await mongoose.disconnect();
  }
});
