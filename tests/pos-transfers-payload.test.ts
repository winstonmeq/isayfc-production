import test from "node:test";
import assert from "node:assert/strict";

test("stock transfer item mapping calculates price, totals, sources and units accurately", () => {
  const items = [
    {
      _id: "item1",
      transferId: "trf1",
      productName: "OS1 CHICKEN",
      categoryName: "CHICKEN",
      source: "BODEGA",
      qty: 2,
      unitLabel: "HEAD",
      packSize: 0,
      baseUnit: "HEAD",
      baseQty: 2,
      sellingPrice: 168,
      buyingPrice: 150,
    },
    {
      _id: "item2",
      transferId: "trf1",
      productName: "SPRING ROLL WRAPPER",
      categoryName: "GROCERY",
      source: "GROCERY",
      qty: 5,
      unitLabel: "PACK",
      packSize: 50,
      baseUnit: "PCS",
      baseQty: 250,
      sellingPrice: 45,
      buyingPrice: 40,
    },
  ];

  const byTransfer = new Map<string, any[]>();
  for (const item of items) {
    const key = String(item.transferId);
    const unitPrice = Number(item.sellingPrice || 0) > 0 ? Number(item.sellingPrice) : Number(item.buyingPrice || 0);
    const qty = Number(item.qty || 0);
    const packSize = Number(item.packSize || 0);
    const unitLabel = (item.unitLabel || "PCS").toUpperCase();
    const source = (item.source === "GROCERY" ? "GROCERY" : "BODEGA") as "BODEGA" | "GROCERY";
    const lineTotal = qty * unitPrice;
    const baseUnit = item.baseUnit || (unitLabel === "HEAD" ? "HEAD" : source === "GROCERY" ? "QTY" : "PCS");
    const baseQty = Number(item.baseQty || (unitLabel === "PACK" && packSize > 0 ? qty * packSize : qty) || 0);

    const list = byTransfer.get(key) || [];
    list.push({
      id: item._id,
      productName: item.productName,
      categoryName: item.categoryName || "",
      source,
      qty,
      unitLabel,
      packSize,
      baseUnit,
      baseQty,
      price: unitPrice,
      totalAmount: lineTotal,
    });
    byTransfer.set(key, list);
  }

  const transferItems = byTransfer.get("trf1") || [];
  const totalAmount = transferItems.reduce((acc, it) => acc + (it.totalAmount || 0), 0);
  const totalQty = transferItems.reduce((acc, it) => acc + (it.qty || 0), 0);

  assert.equal(transferItems.length, 2);
  // Item 1: OS1 (Bodega)
  assert.equal(transferItems[0].productName, "OS1 CHICKEN");
  assert.equal(transferItems[0].source, "BODEGA");
  assert.equal(transferItems[0].qty, 2);
  assert.equal(transferItems[0].unitLabel, "HEAD");
  assert.equal(transferItems[0].price, 168);
  assert.equal(transferItems[0].totalAmount, 336);

  // Item 2: Spring Roll Wrapper (Grocery)
  assert.equal(transferItems[1].productName, "SPRING ROLL WRAPPER");
  assert.equal(transferItems[1].source, "GROCERY");
  assert.equal(transferItems[1].qty, 5);
  assert.equal(transferItems[1].unitLabel, "PACK");
  assert.equal(transferItems[1].packSize, 50);
  assert.equal(transferItems[1].baseQty, 250);
  assert.equal(transferItems[1].price, 45);
  assert.equal(transferItems[1].totalAmount, 225);

  // Overall transfer summary
  assert.equal(totalQty, 7);
  assert.equal(totalAmount, 561); // 336 + 225
});

