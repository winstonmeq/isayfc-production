import assert from "node:assert/strict";
import test from "node:test";
import { applyItemDiscounts, applySaleDiscount, validateDiscountRule } from "../lib/discounts";

test("C10 twenty-peso per-unit discount multiplies automatically by sale quantity", () => {
  for (const quantity of [1, 10, 20]) {
    const sale = applyItemDiscounts([
      { subtotal: quantity * 100, quantity, discount: { name: "C10 -20", type: "AMOUNT", value: 20, basis: "PER_UNIT" } },
      { subtotal: 200, quantity: 2 },
    ]);
    assert.equal(sale.discountAmount, quantity * 20);
    assert.equal(sale.lines[0].lineTotal, quantity * 80);
    assert.equal(sale.lines[1].lineTotal, 200);
  }
});

test("per-row and legacy amount discounts remain once per row", () => {
  for (const basis of [undefined, "PER_ROW"] as const) {
    const sale = applyItemDiscounts([{ subtotal: 1000, quantity: 10, discount: { name: "Voucher", type: "AMOUNT", value: 20, basis } }]);
    assert.equal(sale.discountAmount, 20);
    assert.equal(sale.totalAmount, 980);
  }
});

test("per-unit discount follows packs sold rather than underlying stock pieces", () => {
  const sale = applyItemDiscounts([{ subtotal: 790, quantity: 2, discount: { name: "C10", type: "AMOUNT", value: 20, basis: "PER_UNIT" } }]);
  assert.equal(sale.discountAmount, 40);
  assert.equal(sale.totalAmount, 750);
});

test("percentage discounts use the row subtotal for either calculation basis", () => {
  for (const basis of ["PER_ROW", "PER_UNIT"] as const) {
    const sale = applyItemDiscounts([{ subtotal: 1000, quantity: 10, discount: { name: "Ten percent", type: "PERCENTAGE", value: 10, basis } }]);
    assert.equal(sale.discountAmount, 100);
  }
});

test("per-unit amounts reject missing quantities and discounts above the product price", () => {
  const discount = { name: "C10", type: "AMOUNT" as const, value: 20, basis: "PER_UNIT" as const };
  for (const quantity of [undefined, 0, -1, Infinity, NaN]) {
    assert.throws(() => applyItemDiscounts([{ subtotal: 100, quantity, discount }]));
  }
  assert.throws(() => applyItemDiscounts([{ subtotal: 100, quantity: 10, discount }]));
  assert.throws(() => validateDiscountRule({ ...discount, basis: "INVALID" as "PER_UNIT" }));
});

test("per-unit amounts round fractional sale quantities to cents", () => {
  const sale = applyItemDiscounts([{ subtotal: 100, quantity: 1.5, discount: { name: "Quantity discount", type: "AMOUNT", value: 2.25, basis: "PER_UNIT" } }]);
  assert.equal(sale.discountAmount, 3.38);
  assert.equal(sale.totalAmount, 96.62);
});

test("a discount selected on chicken leaves the grocery product at full price", () => {
  const sale = applyItemDiscounts([
    { subtotal: 790, discount: { name: "Member", type: "PERCENTAGE", value: 10 } },
    { subtotal: 210 },
  ]);
  assert.deepEqual(sale.lines.map((line) => line.lineTotal), [711, 210]);
  assert.equal(sale.discountAmount, 79);
  assert.equal(sale.totalAmount, 921);
});

test("different product rows can have percentage, amount, or no discount", () => {
  const sale = applyItemDiscounts([
    { subtotal: 500, discount: { name: "Ten percent", type: "PERCENTAGE", value: 10 } },
    { subtotal: 300, discount: { name: "Fifty off", type: "AMOUNT", value: 50 } },
    { subtotal: 200 },
  ]);
  assert.deepEqual(sale.lines.map((line) => line.discountAmount), [50, 50, 0]);
  assert.equal(sale.subtotal, 1000);
  assert.equal(sale.totalAmount, 900);
});

test("a fixed discount cannot spill over to other products", () => {
  assert.throws(() => applyItemDiscounts([
    { subtotal: 20, discount: { name: "Fifty off", type: "AMOUNT", value: 50 } },
    { subtotal: 1000 },
  ]));
});

test("product discounts reconcile to cents and may fully discount one product", () => {
  const sale = applyItemDiscounts([
    { subtotal: 19.99, discount: { name: "Ten percent", type: "PERCENTAGE", value: 10 } },
    { subtotal: 10, discount: { name: "Free", type: "PERCENTAGE", value: 100 } },
    { subtotal: 5 },
  ]);
  assert.deepEqual(sale.lines.map((line) => line.lineTotal), [17.99, 0, 5]);
  assert.equal(sale.discountAmount, 12);
  assert.equal(sale.totalAmount, 22.99);
});

test("percentage discount applies to chicken and grocery together", () => {
  const result = applySaleDiscount([790, 210], { name: "Member", type: "PERCENTAGE", value: 10 });
  assert.equal(result.subtotal, 1000);
  assert.equal(result.discountAmount, 100);
  assert.equal(result.totalAmount, 900);
  assert.deepEqual(result.lines.map((line) => line.lineTotal), [711, 189]);
});

test("fixed amount is applied once and allocated to all lines", () => {
  const result = applySaleDiscount([300, 100], { name: "Voucher", type: "AMOUNT", value: 50 });
  assert.equal(result.totalAmount, 350);
  assert.deepEqual(result.lines.map((line) => line.discountAmount), [37.5, 12.5]);
});

test("rounding conserves invoice cents for uneven product prices", () => {
  const result = applySaleDiscount([0.01, 0.01, 0.01], { name: "Voucher", type: "AMOUNT", value: 0.02 });
  assert.deepEqual(result.lines.map((line) => line.lineTotal), [0, 0, 0.01]);
  assert.equal(Math.round(result.lines.reduce((sum, line) => sum + line.discountAmount, 0) * 100), 2);
  assert.equal(result.totalAmount, 0.01);
});

test("no configured selection leaves prices unchanged", () => {
  assert.deepEqual(applySaleDiscount([100, 50]).lines.map((line) => line.lineTotal), [100, 50]);
});

test("invalid and excessive discounts cannot create a negative balance", () => {
  for (const value of [0, -1, NaN, Infinity, 10.001, 101]) {
    assert.throws(() => validateDiscountRule({ name: "Invalid", type: "PERCENTAGE", value }));
  }
  assert.throws(() => applySaleDiscount([50], { name: "Too large", type: "AMOUNT", value: 100 }));
  assert.equal(applySaleDiscount([50], { name: "Free", type: "PERCENTAGE", value: 100 }).totalAmount, 0);
});

test("discounted revenue reduces profit while product cost stays unchanged", () => {
  const sale = applySaleDiscount([1000], { name: "Member", type: "PERCENTAGE", value: 10 });
  const cogs = 50 * 10;
  assert.equal(sale.totalAmount - cogs, 400);
});
