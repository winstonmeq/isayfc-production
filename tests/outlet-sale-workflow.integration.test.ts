import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";

function source(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

test("outlet sale creates exactly one linked draft stock transfer", () => {
  const saleRoute = source("app/api/sales/route.ts");
  const transferModel = source("models/StockTransfer.ts");

  assert.match(saleRoute, /CustomerModel[\s\S]*outletId/);
  assert.match(saleRoute, /StockTransferModel\.create/);
  assert.match(saleRoute, /saleId:\s*sale\._id/);
  assert.match(saleRoute, /status:\s*"DRAFT"/);
  assert.match(
    transferModel,
    /index\(\{\s*saleId:\s*1\s*\},\s*\{\s*unique:\s*true,\s*sparse:\s*true\s*\}\)/
  );
});

test("dispatch, delivery, and confirmation retain atomic state guards", () => {
  const dispatch = source("lib/stock-transfers.ts");
  const deliver = source("app/api/stock-transfers/[id]/deliver/route.ts");
  const confirm = source("app/api/stock-transfers/[id]/confirm/route.ts");

  assert.match(dispatch, /status:\s*"DRAFT"/);
  assert.match(dispatch, /status:\s*"IN_TRANSIT"/);
  assert.match(dispatch, /stockPcs:\s*\{\s*\$gte:\s*pcs\s*\}/);
  assert.match(dispatch, /stockQty:\s*\{\s*\$gte:\s*pcs\s*\}/);
  assert.match(deliver, /status:\s*"IN_TRANSIT"/);
  assert.match(deliver, /status:\s*"DELIVERED"/);
  assert.match(confirm, /status:\s*\{\s*\$in:\s*\["IN_TRANSIT",\s*"DELIVERED"\]\s*\}/);
  assert.match(confirm, /status:\s*"CONFIRMED"/);
  assert.match(confirm, /type:\s*"DELIVERY_RECEIVED"/);
});

test("payment and void routes retain allocation and reversal safeguards", () => {
  const createPayment = source("app/api/payments/route.ts");
  const voidPayment = source("app/api/payments/[id]/route.ts");
  const voidSale = source("app/api/sales/[id]/route.ts");

  assert.match(createPayment, /PaymentAllocationModel\.insertMany/);
  assert.match(createPayment, /withTransaction/);
  assert.match(voidPayment, /\{\s*_id:\s*id,\s*isVoided:\s*false\s*\}/);
  assert.match(voidPayment, /PaymentAllocationModel\.find/);
  assert.match(voidPayment, /correctionType:\s*"VOID"/);
  assert.match(voidSale, /status:\s*"VOIDED"/);
  assert.match(voidSale, /type:\s*"VOID_REVERSAL"/);
  assert.match(
    voidSale,
    /Cancel the linked stock transfer before voiding this sale/
  );
});

test("mobile cashier flow retains shift, cash, confirmation, and void guards", () => {
  const sale = source("app/api/mobile/sales/route.ts");
  const closeShift = source("app/api/mobile/cash/close/route.ts");
  const expense = source("app/api/mobile/expenses/route.ts");
  const confirm = source("app/api/mobile/transfers/[id]/route.ts");
  const voidSale = source("app/api/mobile/sales/[id]/route.ts");
  const quickAdd = source("app/api/mobile/products/route.ts");

  assert.match(sale, /cashReceived\s*<\s*totalAmount/);
  assert.match(sale, /CashShiftModel\.findOneAndUpdate/);
  assert.match(sale, /status:\s*"OPEN"/);
  assert.match(closeShift, /status:\s*"CLOSING"/);
  assert.match(closeShift, /withTransaction/);
  assert.match(expense, /CashShiftModel\.findOneAndUpdate/);
  assert.match(confirm, /status:\s*\{\s*\$in:\s*\["IN_TRANSIT",\s*"DELIVERED"\]\s*\}/);
  assert.match(confirm, /StockTransferModel\.findOneAndUpdate/);
  assert.match(voidSale, /status:\s*"VOIDED"/);
  assert.match(voidSale, /type:\s*"VOID"/);
  assert.match(voidSale, /stockQty:\s*Number\(movement\.quantity/);
  assert.match(quickAdd, /does not match outlet inventory/);
});
