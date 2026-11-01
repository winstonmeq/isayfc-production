import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { manilaDateString } from "../lib/date-utils";
import { OutletEmployee, OutletEmployeePurchase, OutletEmployeeCash } from "../models/OutletEmployeeFinance";

import OutletModel from "../models/Outlet";
import OutletInventoryModel from "../models/OutletInventory";
import OutletMenuItemModel from "../models/OutletMenuItem";
import OutletStockTransactionModel from "../models/OutletStockTransaction";
import StockTransferModel from "../models/StockTransfer";
import StockTransferItemModel from "../models/StockTransferItem";
import SaleModel from "../models/Sale";
import SaleLineModel from "../models/SaleLine";
import ExpenseModel from "../models/Expense";

// Run against a dedicated test server using the SAME test database and an
// authenticated ADMIN cookie. Never point this suite at the production app.
const uri = process.env.TEST_MONGODB_URI;
const baseUrl = process.env.TEST_POS_BASE_URL;
const cookie = process.env.TEST_POS_ADMIN_COOKIE;

test("POS receipt, mixing, rollback, final sale and oversell rejection", {
  skip: !uri || !baseUrl || !cookie
    ? "Requires TEST_MONGODB_URI, TEST_POS_BASE_URL and TEST_POS_ADMIN_COOKIE"
    : false,
}, async () => {
  const parsed = new URL(uri!.replace(/^mongodb\+srv:/, "https:").replace(/^mongodb:/, "http:"));
  assert.match(parsed.pathname, /test/i, "Use a dedicated database with 'test' in its name.");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl!).hostname), "Use a local test server.");
  await mongoose.connect(uri!);
  const outletId = new mongoose.Types.ObjectId();
  const transferId = new mongoose.Types.ObjectId();
  const saleId = new mongoose.Types.ObjectId();
  const rawProductId = new mongoose.Types.ObjectId();
  const menuId = new mongoose.Types.ObjectId();
  const receipt = `TEST-${outletId}`;

  async function post(path: string, body: unknown, expected = 200) {
    const response = await fetch(new URL(path, baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie! },
      body: JSON.stringify(body),
      redirect: "error",
    });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  }

  try {
    await OutletModel.create({ _id: outletId, name: receipt, code: receipt });
    await OutletMenuItemModel.create({ _id: menuId, outletId, name: "TEST CHICKEN", category: "BUTTERED", price: 20 });
    await SaleModel.create({ _id: saleId, receiptNumber: receipt, source: "CHICKEN", transactionType: "INTERNAL_TRANSFER", totalAmount: 500, totalQty: 50, fulfillmentStatus: "PENDING", status: "PENDING", balance: 0 });
    await SaleLineModel.create({ saleId, source: "CHICKEN", bodegaProductId: rawProductId, productName: "TEST CHICKEN", categoryName: "CHICKEN", qty: 1, stockUnit: "PACK", packSize: 50, stockPcsOut: 50, baseQty: 50, unitCost: 6, price: 500, lineTotal: 500 });
    await StockTransferModel.create({ _id: transferId, transferNumber: receipt, outletId, saleId, status: "IN_TRANSIT", totalItems: 1, totalQty: 50 });
    await StockTransferItemModel.create({ transferId, source: "BODEGA", bodegaProductId: rawProductId, productName: "TEST CHICKEN", qty: 1, qtyPcs: 50, unitLabel: "PACK", packSize: 50, sellingPrice: 500, companyUnitCost: 6 });

    await post(`/api/pos/transfers/${transferId}/confirm`, { outletId });
    const raw = await OutletInventoryModel.findOne({ outletId, productId: rawProductId }).orFail();
    assert.equal(raw.stockQty, 50);
    assert.equal(raw.companyUnitCost, 6);
    const internal = await SaleModel.findById(saleId).orFail();
    assert.equal(internal.transactionType, "EXTERNAL_SALE");
    assert.equal(internal.status, "UNPAID");
    assert.equal(internal.balance, 500);
    assert.equal(internal.paidAmount, 0);
    assert.equal(String(internal.ownerOutletId), String(outletId));
    const generated = await ExpenseModel.find({ linkedTransferId: transferId }).lean();
    assert.equal(generated.length, 1);
    assert.equal(generated[0].amount, 500);
    assert.equal(generated[0].expenseCategory, "BODEGA");
    assert.equal(generated[0].outletId, undefined);
    assert.equal((await SaleModel.findById(saleId).orFail()).fulfillmentStatus, "RECOGNIZED");
    const reportResponse = await fetch(new URL("/api/reports/sales?preset=today", baseUrl), { headers: { Cookie: cookie! } });
    assert.equal(reportResponse.status, 200);
    const report = await reportResponse.json();
    assert.equal(report.rows.some((row: { saleId: string }) => row.saleId === String(saleId)), true);
    await post(`/api/pos/transfers/${transferId}/confirm`, { outletId }, 409);
    assert.equal(await ExpenseModel.countDocuments({ linkedTransferId: transferId }), 1);
    assert.equal((await OutletInventoryModel.findById(raw._id).orFail()).stockQty, 50);

    // Raw stock has the exact menu name; it must not be sold before mixing.
    await post("/api/pos/sales", { outletId, items: [{ menuItemId: menuId, qty: 1 }], cashReceived: 20 }, 409);
    assert.equal((await OutletInventoryModel.findById(raw._id).orFail()).stockQty, 50);
    assert.equal(await SaleModel.countDocuments({ outletId, source: "OUTLET" }), 0);

    // Same name as the raw ingredient must still create a distinct menu stock.
    const batch = { outletId, sources: [{ inventoryId: raw._id, quantity: 50 }], menuItemId: menuId, outputQty: 50 };
    await post("/api/pos/mixing", { ...batch, outputQty: 1.5 }, 400);
    await post("/api/pos/mixing", { ...batch, sources: [{ inventoryId: raw._id, quantity: 51 }] }, 409);
    assert.equal((await OutletInventoryModel.findById(raw._id).orFail()).stockQty, 50);
    assert.equal(await OutletInventoryModel.countDocuments({ outletId, productId: menuId }), 0);

    await post("/api/pos/mixing", batch);
    const finished = await OutletInventoryModel.findOne({ outletId, productId: menuId }).orFail();
    assert.equal(finished.stockQty, 50);
    assert.equal(finished.buyingPrice, 10);
    assert.equal(finished.companyUnitCost, 6);
    assert.equal(finished.packSize, 0);
    assert.equal((await OutletInventoryModel.findById(raw._id).orFail()).stockQty, 0);
    await post("/api/pos/sales", { outletId, items: [{ menuItemId: menuId, qty: 1.5 }], cashReceived: 40 }, 400);
    assert.equal((await OutletInventoryModel.findById(finished._id).orFail()).stockQty, 50);

    const sale = await post("/api/pos/sales", { outletId, items: [{ menuItemId: menuId, qty: 50 }], cashReceived: 1000 });
    assert.equal(sale.sale.totalAmount, 1000);
    assert.equal((await OutletInventoryModel.findById(finished._id).orFail()).stockQty, 0);
    const lines = await SaleLineModel.find({ saleId: sale.sale.id });
    assert.equal(lines.reduce((sum, line) => sum + line.unitCost * Number(line.baseQty), 0), 500);
    assert.equal(lines.reduce((sum, line) => sum + Number(line.companyUnitCost) * Number(line.baseQty), 0), 300);
    const overallResponse = await fetch(new URL("/api/reports/overall?preset=today", baseUrl), { headers: { Cookie: cookie! } });
    assert.equal(overallResponse.status, 200);
    const overall = await overallResponse.json();
    const retailRow = overall.rows.find((row: { id: string }) => row.id === sale.sale.id);
    assert.equal(retailRow.netSales, 1000);
    assert.equal(retailRow.cogs, 300); // Original company cost, not outlet transfer cost of 500.
    assert.equal(retailRow.grossProfit, 700);
    assert.equal(overall.rows.some((row: { id: string }) => row.id === String(saleId)), false);
    const movements = await OutletStockTransactionModel.find({ outletId, type: "SALE" });
    assert.equal(movements.length, 1);
    assert.equal(movements[0].previousStock, 50);
    assert.equal(movements[0].newStock, 0);
    await post("/api/pos/sales", { outletId, items: [{ menuItemId: menuId, qty: 1 }], cashReceived: 20 }, 409);
    assert.equal(await SaleModel.countDocuments({ outletId, source: "OUTLET" }), 1);
    // Employee-funded restock, credit sale, partial collection and reimbursement.
    await post("/api/pos/employee-finance", { action: "EMPLOYEE", outletId, name: "TEST EMPLOYEE" });
    const employee = await OutletEmployee.findOne({ outletId }).orFail();
    const purchaseRequest = { action: "PURCHASE", outletId, employeeId: employee._id, inventoryId: finished._id, quantity: 10, amount: 100, supplier: "TEST OUTSIDE SHOP", receipt: receipt, date: manilaDateString(), requestKey: randomUUID() };
    await post("/api/pos/employee-finance", purchaseRequest);
    await post("/api/pos/employee-finance", purchaseRequest); // Retry cannot receive twice.
    assert.equal((await OutletInventoryModel.findById(finished._id).orFail()).stockQty, 10);
    const purchase = await OutletEmployeePurchase.findOne({ outletId }).orFail();
    const creditRequest = { outletId, paymentMethod: "CREDIT", employeeId: String(employee._id), items: [{ menuItemId: menuId, qty: 2 }], idempotencyKey: randomUUID() };
    const credit = await post("/api/pos/sales", creditRequest);
    await post("/api/pos/sales", creditRequest);
    const creditSale = await SaleModel.findById(credit.sale.id).orFail();
    assert.equal(creditSale.totalAmount, 40);
    assert.equal(creditSale.paidAmount, 0);
    assert.equal(creditSale.balance, 40);
    assert.equal((await OutletInventoryModel.findById(finished._id).orFail()).stockQty, 8);
    const collection = { action: "COLLECT", outletId, employeeId: employee._id, referenceId: creditSale._id, amount: 20, date: manilaDateString(), requestKey: randomUUID() };
    await post("/api/pos/employee-finance", collection);
    await post("/api/pos/employee-finance", collection);
    assert.equal((await SaleModel.findById(creditSale._id).orFail()).balance, 20);
    await post("/api/pos/employee-finance", { ...collection, amount: 21, requestKey: randomUUID() }, 409);
    await post("/api/pos/employee-finance", { action: "REIMBURSE", outletId, employeeId: employee._id, referenceId: purchase._id, amount: 50, date: manilaDateString(), requestKey: randomUUID() });
    assert.equal((await OutletEmployeePurchase.findById(purchase._id).orFail()).reimbursed, 50);
    assert.equal(await OutletEmployeeCash.countDocuments({ outletId }), 2);
    assert.equal(await SaleModel.countDocuments({ outletId, source: "OUTLET" }), 2); // Collection is not a sale.
    assert.equal((await OutletInventoryModel.findById(finished._id).orFail()).stockQty, 8); // Reimbursement moves cash only.
  } finally {
    await ExpenseModel.deleteMany({ linkedTransferId: transferId });
    await OutletEmployeeCash.deleteMany({ outletId });
    await OutletEmployeePurchase.deleteMany({ outletId });
    await OutletEmployee.deleteMany({ outletId });
    // Only remove this test's exact IDs and outlet-scoped fixtures.
    const sales = await SaleModel.find({ $or: [{ outletId }, { _id: saleId }] }).select("_id");
    await SaleLineModel.deleteMany({ saleId: { $in: sales.map((sale) => sale._id) } });
    await SaleModel.deleteMany({ _id: { $in: sales.map((sale) => sale._id) } });
    await OutletStockTransactionModel.deleteMany({ outletId });
    await OutletInventoryModel.deleteMany({ outletId });
    await OutletMenuItemModel.deleteMany({ outletId });
    await StockTransferItemModel.deleteMany({ transferId });
    await StockTransferModel.deleteOne({ _id: transferId });
    await OutletModel.deleteOne({ _id: outletId });
    await mongoose.disconnect();
  }
});
