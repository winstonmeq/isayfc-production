import assert from "node:assert/strict";
import test from "node:test";

import { activeMovementTransactions } from "../lib/stock-movement-report";

test("hides an original movement and its void reversal", () => {
  const transactions = [
    {
      _id: "original",
      bodegaProductId: "ps4",
      referenceId: "delivery-1",
      type: "STOCK_IN",
      quantity: 60,
      previousStock: 0,
      newStock: 60,
      createdAt: "2026-07-25T08:00:00Z",
    },
    {
      _id: "reversal",
      bodegaProductId: "ps4",
      referenceId: "delivery-1",
      type: "VOID_REVERSAL",
      quantity: 60,
      previousStock: 60,
      newStock: 0,
      createdAt: "2026-07-25T08:01:00Z",
    },
    {
      _id: "corrected",
      bodegaProductId: "ps4",
      referenceId: "delivery-1",
      type: "STOCK_IN",
      quantity: 60,
      previousStock: 0,
      newStock: 60,
      createdAt: "2026-07-25T08:02:00Z",
    },
  ];

  assert.deepEqual(
    activeMovementTransactions(transactions).map((entry) => entry._id),
    ["corrected"]
  );
});

test("does not hide legitimate stock out movements", () => {
  const transactions = [
    {
      _id: "delivery",
      bodegaProductId: "ps4",
      referenceId: "delivery-1",
      type: "STOCK_IN",
      quantity: 60,
      previousStock: 0,
      newStock: 60,
      createdAt: "2026-07-25T08:00:00Z",
    },
    {
      _id: "slicing",
      bodegaProductId: "ps4",
      referenceId: "slice-1",
      type: "STOCK_OUT",
      quantity: 20,
      previousStock: 60,
      newStock: 40,
      createdAt: "2026-07-25T09:00:00Z",
    },
  ];

  assert.equal(activeMovementTransactions(transactions).length, 2);
});
