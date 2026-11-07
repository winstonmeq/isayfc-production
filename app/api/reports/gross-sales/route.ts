import { internalOutletMatchClauses } from "@/lib/internal-outlet";
import { NextRequest, NextResponse } from "next/server";
import { recognizedSaleRange } from "@/lib/business-flow";
import { Types } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { manilaDateString } from "@/lib/date-utils";
import { getExpenseTypeNames } from "@/lib/expense-types";
import { salesReportAmounts } from "@/lib/sales-report-amounts";
import { outletSaleMatchClauses } from "@/lib/sale-origin";
import { parseReportRange, roundMoney } from "@/lib/report-utils";
import { requirePermission } from "@/lib/require-permission";
import ExpenseModel from "@/models/Expense";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";
import { postedMainReturns } from "@/lib/main-return-report";
import { excludeLegacyDeliveryExpenses } from "@/lib/main-expense-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SaleLineRow = {
  source?: string;
  categoryName?: string;
  productName?: string;
  qty?: number;
  price?: number;
  lineTotal?: number;
  grossLineTotal?: number;
  discountAmount?: number;
  unitCost?: number;
  stockUnit?: string;
  packSize?: number;
  stockPcsOut?: number;
  baseQty?: number;
};

type ProductBucket = {
  key: string;
  productName: string;
  categoryName: string;
  source: string;
  packUnits: number;
  packRevenue: number;
  pieceUnits: number;
  pieceRevenue: number;
  stockUnitsOut: number;
  cogs: number;
  discounts: number;
  salesReturns: number;
};

type StockRollForward = {
  beginning: number;
  processed: number;
  ending: number;
};

export async function GET(request: NextRequest) {
  const { response } = await requirePermission("reports.profit");
  if (response) return response;

  await dbConnect();
  const { searchParams } = new URL(request.url);
  const { start, end } = parseReportRange(searchParams);

  const sales = await SaleModel.find({
    isVoided: false,
    fulfillmentStatus: { $ne: "PENDING" },
    $expr: recognizedSaleRange(start, end),
    $nor: [...outletSaleMatchClauses(), ...internalOutletMatchClauses()],
  })
    .select("_id")
    .lean<Array<{ _id: Types.ObjectId }>>();

  const saleIds = sales.map((sale) => sale._id);

  const lines = saleIds.length
    ? await SaleLineModel.find({ saleId: { $in: saleIds } })
        .select(
          "source categoryName productName qty price lineTotal grossLineTotal discountAmount unitCost stockUnit packSize stockPcsOut baseQty"
        )
        .lean<SaleLineRow[]>()
    : [];

  const buckets = new Map<string, ProductBucket>();
  for (const line of lines) {
    const productName = String(line.productName || "UNNAMED PRODUCT").toUpperCase();
    const categoryName = String(line.categoryName || line.source || "OTHER").toUpperCase();
    const source = String(line.source || "OTHER").toUpperCase();
    const key = `${source}:${productName}`;
    const bucket = buckets.get(key) || {
      key,
      productName,
      categoryName,
      source,
      packUnits: 0,
      packRevenue: 0,
      pieceUnits: 0,
      pieceRevenue: 0,
      stockUnitsOut: 0,
      cogs: 0,
      discounts: 0,
      salesReturns: 0,
    };

    const qty = Number(line.qty || 0);
    const amounts = salesReportAmounts(line);
    const revenue = amounts.grossSales;
    bucket.discounts = roundMoney(bucket.discounts + amounts.discounts);
    const stockUnits = Number(line.baseQty ?? line.stockPcsOut ?? qty);
    if (line.stockUnit === "PACK") {
      bucket.packUnits += qty;
      bucket.packRevenue = roundMoney(bucket.packRevenue + revenue);
    } else {
      bucket.pieceUnits += qty;
      bucket.pieceRevenue = roundMoney(bucket.pieceRevenue + revenue);
    }
    bucket.stockUnitsOut += stockUnits;
    bucket.cogs = roundMoney(
      bucket.cogs + stockUnits * Number(line.unitCost || 0)
    );
    buckets.set(key, bucket);
  }

  const returns = await postedMainReturns(start, end);
  for (const row of returns) {
    const key = `${row.source}:${row.product.toUpperCase()}`;
    const bucket = buckets.get(key) || { key, productName: row.product.toUpperCase(), categoryName: row.category, source: row.source, packUnits: 0, packRevenue: 0, pieceUnits: 0, pieceRevenue: 0, stockUnitsOut: 0, cogs: 0, discounts: 0, salesReturns: 0 };
    bucket.salesReturns = roundMoney(bucket.salesReturns + row.amount);
    bucket.cogs = roundMoney(bucket.cogs - row.restoredCost);
    buckets.set(key, bucket);
  }
  const bodegaProducts = await BodegaProductModel.find({ isActive: true })
    .select("name stockQty")
    .lean<Array<{ _id: Types.ObjectId; name?: string; stockQty?: number }>>();
  const bodegaIds = bodegaProducts.map((product) => product._id);
  const bodegaTransactions = bodegaIds.length
    ? await BodegaStockTransactionModel.find({
        bodegaProductId: { $in: bodegaIds },
        transactionDate: { $gte: start },
      })
        .select("bodegaProductId transactionDate previousStock newStock referenceType")
        .lean<
          Array<{
            bodegaProductId: Types.ObjectId;
            transactionDate: Date;
            previousStock?: number;
            newStock?: number;
            referenceType?: string;
          }>
        >()
    : [];

  const rollForwardByName = new Map<string, StockRollForward>();
  for (const product of bodegaProducts) {
    const productId = product._id.toString();
    const current = Number(product.stockQty || 0);
    const transactions = bodegaTransactions.filter(
      (transaction) => transaction.bodegaProductId.toString() === productId
    );
    const afterStart = transactions.reduce(
      (sum, transaction) =>
        sum + Number(transaction.newStock || 0) - Number(transaction.previousStock || 0),
      0
    );
    const afterEnd = transactions
      .filter((transaction) => new Date(transaction.transactionDate) >= end)
      .reduce(
        (sum, transaction) =>
          sum + Number(transaction.newStock || 0) - Number(transaction.previousStock || 0),
        0
      );
    const processed = transactions
      .filter(
        (transaction) =>
          new Date(transaction.transactionDate) < end &&
          transaction.referenceType === "SLICING_BATCH" &&
          Number(transaction.newStock || 0) > Number(transaction.previousStock || 0)
      )
      .reduce(
        (sum, transaction) =>
          sum + Number(transaction.newStock || 0) - Number(transaction.previousStock || 0),
        0
      );
    rollForwardByName.set(String(product.name || "").toUpperCase(), {
      beginning: current - afterStart,
      processed,
      ending: current - afterEnd,
    });
  }

  const products = [...buckets.values()]
    .map((bucket) => {
      const grossSales = roundMoney(bucket.packRevenue + bucket.pieceRevenue);
      const netSales = roundMoney(grossSales - bucket.discounts - bucket.salesReturns);
      const cogs = roundMoney(bucket.cogs);
      const rollForward =
        bucket.source === "CHICKEN"
          ? rollForwardByName.get(bucket.productName)
          : undefined;
      return {
        ...bucket,
        packUnits: Math.round(bucket.packUnits * 100) / 100,
        pieceUnits: Math.round(bucket.pieceUnits * 100) / 100,
        stockUnitsOut: Math.round(bucket.stockUnitsOut * 100) / 100,
        packPrice:
          bucket.packUnits > 0
            ? roundMoney(bucket.packRevenue / bucket.packUnits)
            : 0,
        piecePrice:
          bucket.pieceUnits > 0
            ? roundMoney(bucket.pieceRevenue / bucket.pieceUnits)
            : 0,
        grossSales,
        netSales,
        cogs,
        grossProfit: roundMoney(netSales - cogs),
        beginningInventory: rollForward?.beginning || 0,
        processedChickenCuts: rollForward?.processed || 0,
        endingInventory: rollForward?.ending || 0,
      };
    })
    .sort((a, b) => b.grossSales - a.grossSales || a.productName.localeCompare(b.productName));

  // Outlet POS has its own P&L. Including it here would count transferred
  // Chicken/Grocery inventory as revenue a second time.
  const outletCogs = 0;
  const grossSales = roundMoney(
    products.reduce((sum, product) => sum + product.grossSales, 0)
  );
  const productCogs = roundMoney(
    products.reduce((sum, product) => sum + product.cogs, 0)
  );
  const discounts = roundMoney(products.reduce((sum, product) => sum + product.discounts, 0));
  const salesReturns = roundMoney(returns.reduce((sum, row) => sum + row.amount, 0));
  const netSales = roundMoney(grossSales - discounts - salesReturns);
  const totalCogs = roundMoney(productCogs + outletCogs);
  const grossProfit = roundMoney(netSales - totalCogs);

  const expenseRows = await ExpenseModel.aggregate<{
    _id: string;
    total?: number;
  }>([
    {
      $match: {
        isActive: true,
        ...excludeLegacyDeliveryExpenses(),
        expenseDate: { $gte: start, $lt: end },
        $nor: [
          { expenseCategory: "OUTLET" },
          { outletId: { $exists: true, $ne: null } },
          { remarks: { $regex: "MOBILE EXPENSE OUTLET:", $options: "i" } },
        ],
      },
    },
    { $group: { _id: "$type", total: { $sum: "$amount" } } },
  ]);
  const expenseNames = await getExpenseTypeNames();
  const expenses = expenseRows
    .map((expense) => ({
      type: String(expense._id || "OTHERS"),
      name: expenseNames.get(String(expense._id || "OTHERS")) || String(expense._id || "OTHERS").replaceAll("_", " "),
      total: roundMoney(Number(expense.total || 0)),
    }))
    .sort((a, b) => b.total - a.total || a.type.localeCompare(b.type));
  const totalOperatingExpenses = roundMoney(
    expenses.reduce((sum, expense) => sum + expense.total, 0)
  );
  const netIncome = roundMoney(grossProfit - totalOperatingExpenses);

  return NextResponse.json({
    success: true,
    range: { start: start.toISOString(), end: end.toISOString() },
    generatedAt: manilaDateString(),
    products,
    returns,
    totals: {
      packUnits: products.reduce((sum, product) => sum + product.packUnits, 0),
      packSales: roundMoney(products.reduce((sum, product) => sum + product.packRevenue, 0)),
      pieceUnits: products.reduce((sum, product) => sum + product.pieceUnits, 0),
      pieceSales: roundMoney(products.reduce((sum, product) => sum + product.pieceRevenue, 0)),
      grossSales,
      discounts,
      salesReturns,
      netSales,
      beginningInventory: products.reduce(
        (sum, product) => sum + product.beginningInventory,
        0
      ),
      processedChickenCuts: products.reduce(
        (sum, product) => sum + product.processedChickenCuts,
        0
      ),
      endingInventory: products.reduce(
        (sum, product) => sum + product.endingInventory,
        0
      ),
      productCogs,
      outletCogs,
      totalCogs,
      grossProfit,
      totalOperatingExpenses,
      netIncome,
      profitabilityRatio: netSales > 0 ? Math.round((netIncome / netSales) * 10000) / 100 : 0,
    },
    expenses,
  });
}
