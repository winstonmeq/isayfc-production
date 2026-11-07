import test from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import SaleLine from "../models/SaleLine";
import TransferItem from "../models/StockTransferItem";

test("KG sale snapshots preserve fractional base quantity and actual kilos", async () => {
  const row = new SaleLine({ saleId: new Types.ObjectId(), source: "CHICKEN", bodegaProductId: new Types.ObjectId(), productName: "LETSON", unitCode: "KG", qty: 0.5, price: 300, lineTotal: 150, unitCost: 225, stockUnit: "QTY", stockPcsOut: 0.5, baseUnit: "KG", baseQty: 0.5, entryUnit: "QTY", kilosOut: 0.5 });
  await row.validate(); assert.equal(row.baseUnit, "KG"); assert.equal(row.kilosOut, 0.5);
});
test("KG deliveries and head weight snapshots validate without rounding", async () => {
  const item = new TransferItem({ transferId: new Types.ObjectId(), source: "BODEGA", bodegaProductId: new Types.ObjectId(), productName: "LETSON", qty: 0.5, qtyPcs: 0.5, baseQty: 0.5, baseUnit: "KG", unitLabel: "QTY", kilosOut: 0.5 });
  await item.validate(); assert.equal(item.kilosOut, 0.5); assert.equal(item.qtyPcs, 0.5);
});
