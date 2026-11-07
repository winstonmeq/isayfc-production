import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { employeeCreditAmounts, validCreditDate, validEmployeeCode } from "../lib/employee-credit-policy";

test("employee credit and collections do not change the original sale revenue", () => {
  const sale = { totalAmount: 500, paidAmount: 0 };
  assert.deepEqual(employeeCreditAmounts(sale), { credit: 500, paid: 0, balance: 500 });
  assert.deepEqual(employeeCreditAmounts({ ...sale, paidAmount: 150 }), { credit: 500, paid: 150, balance: 350 });
  assert.deepEqual(employeeCreditAmounts({ ...sale, paidAmount: 500 }), { credit: 500, paid: 500, balance: 0 });
  assert.equal(sale.totalAmount, 500);
});
test("return credit and refunded payments are reflected in employee balances", () => {
  assert.deepEqual(employeeCreditAmounts({ totalAmount: 500, returnedAmount: 100, paidAmount: 150 }), { credit: 400, paid: 150, balance: 250 });
  assert.deepEqual(employeeCreditAmounts({ totalAmount: 500, returnedAmount: 100, paidAmount: 500, refundedAmount: 100 }), { credit: 400, paid: 400, balance: 0 });
});
test("employee identity uses a stable code, not automatic name matching", () => {
  assert.equal(validEmployeeCode("EMP-001"), true);
  assert.equal(validEmployeeCode("MARIA SANTOS"), false);
  assert.equal(validEmployeeCode(""), false);
});
test("collection date rejects invalid dates and future entries", () => {
  assert.equal(validCreditDate("2026-11-07", "2026-11-07"), true);
  assert.equal(validCreditDate("2026-11-08", "2026-11-07"), false);
  assert.equal(validCreditDate("2026-02-30", "2026-11-07"), false);
  assert.equal(validCreditDate("bad", "2026-11-07"), false);
});

test("central employee collections are authorized, atomic and never post sales or stock", () => {
  const route = readFileSync("app/api/employee-credits/route.ts", "utf8");
  assert.match(route, /requirePermission\("payments.view"\)/);
  assert.match(route, /requirePermission\("payments.manage"\)/);
  assert.match(route, /withTransaction/);
  assert.match(route, /employeeCollectionHash/);
  assert.match(route, /amount > balance/);
  assert.match(route, /PaymentAllocation.create/);
  assert.match(route, /receivedAt: "MAIN"/);
  assert.doesNotMatch(route, /Sale.create|SaleLine.create|stockQty\s*=/);
});
test("outlet cash reports exclude collections physically received at main", () => {
  for (const path of ["app/api/pos/route.ts", "app/api/pos/reports/route.ts"]) {
    assert.match(readFileSync(path, "utf8"), /receivedAt: \{ \$ne: "MAIN" \}/);
  }
});
test("employee credits are exposed through the Payment navigation and shared surface", () => {
  for (const path of ["components/app-shell/nav-config.ts", "components/app-shell/AppModuleBar.tsx", "components/app-shell/ModuleSurface.tsx"]) {
    assert.match(readFileSync(path, "utf8"), /\/payments\/employee-credits/);
  }
});

test("main sales default to Customer and require a deliberate employee credit confirmation", () => {
  const client = readFileSync("components/sales/AllSalesPageClient.tsx", "utf8");
  assert.match(client, /useState<"CUSTOMER" \| "EMPLOYEE">\("CUSTOMER"\)/);
  assert.match(client, /setSaleTo\(event.target.value as "CUSTOMER" \| "EMPLOYEE"\); setCustomerId\(""\)/);
  assert.match(client, /saleTo === "EMPLOYEE" && !window.confirm/);
  const server = readFileSync("app/api/sales/route.ts", "utf8");
  assert.match(server, /saleTo === "EMPLOYEE" && !employeeAccount/);
  assert.match(server, /saleTo === "CUSTOMER" && employeeAccount/);
});
