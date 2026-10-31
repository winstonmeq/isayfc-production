import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import Product from "../models/Product";
import Supplier from "../models/Supplier";
import Batch from "../models/PurchaseBatch";
import Item from "../models/PurchaseItem";
import Invoice from "../models/SupplierInvoice";
import Payment from "../models/SupplierPayment";
import Ledger from "../models/InventoryTransaction";
import { manilaDateString } from "../lib/date-utils";

const uri = process.env.TEST_MONGODB_URI, base = process.env.TEST_POS_BASE_URL, cookie = process.env.TEST_POS_ADMIN_COOKIE;
test("grocery receipt, invoice, payment, metadata edit, duplicate rollback and void", { skip: !uri || !base || !cookie ? "Requires dedicated test database, local server and admin test cookie" : false }, async () => {
  assert.match(new URL(uri!.replace(/^mongodb\+srv:/, "https:").replace(/^mongodb:/, "http:")).pathname, /test/i);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base!).hostname));
  await mongoose.connect(uri!);
  const supplierId = new mongoose.Types.ObjectId(), productId = new mongoose.Types.ObjectId();
  const prefix = `TEST-GROCERY-${supplierId}`;
  const batchIds: string[] = [];
  async function request(path: string, method: string, body: unknown, status: number) {
    const response = await fetch(new URL(path, base), { method, headers: { Cookie: cookie!, "Content-Type": "application/json" }, body: JSON.stringify(body), redirect: "error" });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }
  try {
    await Supplier.create({ _id: supplierId, name: prefix });
    await Product.create({ _id: productId, name: prefix, categoryId: new mongoose.Types.ObjectId(), stockPcs: 0 });
    const body = { supplierId, invoiceNumber: prefix, datePurchased: manilaDateString(), dueDate: manilaDateString(), paymentMode: "CREDIT", items: [{ productId, buyingPrice: 5, quantity: 20 }] };
    const created = await request("/api/purchase-batches", "POST", body, 201);
    batchIds.push(created.data._id);
    const invoice = await Invoice.findOne({ purchaseBatchId: created.data._id }).orFail();
    assert.equal(invoice.amount, 100); assert.equal(invoice.balance, 100);
    assert.equal((await Product.findById(productId).orFail()).stockPcs, 20);
    await request("/api/purchase-batches", "POST", body, 409);
    assert.equal((await Product.findById(productId).orFail()).stockPcs, 20);
    await request(`/api/supplier-invoices/${invoice._id}/payments`, "POST", { amount: 30, paymentMethod: "CASH" }, 200);
    const movements = await Ledger.countDocuments({ productId });
    await Product.updateOne({ _id: productId }, { $set: { stockPcs: 0 } }); // Simulate consumed stock.
    await request(`/api/purchase-batches/${created.data._id}`, "PATCH", { ...body, remarks: "Invoice detail correction only" }, 200);
    assert.equal(await Ledger.countDocuments({ productId }), movements);
    assert.equal((await Product.findById(productId).orFail()).stockPcs, 0);
    assert.equal((await Invoice.findById(invoice._id).orFail()).balance, 70);
    const cashBody = { ...body, invoiceNumber: `${prefix}-CASH`, paymentMode: "CASH", items: [{ productId, buyingPrice: 10, quantity: 5 }] };
    const cash = await request("/api/purchase-batches", "POST", cashBody, 201);
    batchIds.push(cash.data._id);
    const paid = await Invoice.findOne({ purchaseBatchId: cash.data._id }).orFail();
    assert.equal(paid.status, "PAID"); assert.equal(paid.balance, 0);
    await request(`/api/purchase-batches/${cash.data._id}`, "PATCH", cashBody, 200);
    assert.equal(await Payment.countDocuments({ supplierInvoiceId: paid._id }), 1);
    await request(`/api/purchase-batches/${cash.data._id}`, "DELETE", {}, 409);
    assert.equal((await Product.findById(productId).orFail()).stockPcs, 5);
    const unpaid = await request("/api/purchase-batches", "POST", { ...cashBody, invoiceNumber: `${prefix}-VOID`, paymentMode: "CREDIT" }, 201);
    batchIds.push(unpaid.data._id);
    await request(`/api/purchase-batches/${unpaid.data._id}`, "DELETE", {}, 200);
    assert.equal((await Invoice.findOne({ purchaseBatchId: unpaid.data._id }).orFail()).status, "VOID");
    assert.equal((await Product.findById(productId).orFail()).stockPcs, 5);
  } finally {
    await Payment.deleteMany({ supplierId });
    await Invoice.deleteMany({ supplierId });
    await Item.deleteMany({ purchaseBatchId: { $in: batchIds } });
    await Batch.deleteMany({ _id: { $in: batchIds } });
    await Ledger.deleteMany({ productId });
    await Product.deleteOne({ _id: productId });
    await Supplier.deleteOne({ _id: supplierId });
    await mongoose.disconnect();
  }
});
