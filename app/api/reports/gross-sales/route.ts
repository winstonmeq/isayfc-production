import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { manilaDateString } from "@/lib/date-utils";
import { cogsByOutlet } from "@/lib/outlet-profit";
import { parseReportRange, roundMoney } from "@/lib/report-utils";
import { requirePermission } from "@/lib/require-permission";
import ExpenseModel from "@/models/Expense";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SaleLineRow = {
  saleId?: Types.ObjectId;
  source?: string;
  categoryName?: string;
  productName?: string;
  qty?: number;
  price?: number;
  lineTotal?: number;
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
};

export async function GET(request: NextRequest) {
  const { response } = await requirePermission("reports.profit");
  if (response) return response;

  await dbConnect();
  const { searchParams } = new URL(request.url);
  const { start, end } = parseReportRange(searchParams);

  const sales = await SaleModel.find({
    isVoided: false,
    saleDate: { $gte: start, $lt: end },
  })
    .select("_id channel receiptNumber")
    .lean<Array<{ _id: Types.ObjectId; channel?: string; receiptNumber?: string }>>();

  const saleIds = sales.map((sale) => sale._id);
  const mobileSaleIds = new Set(
    sales
      .filter(
        (sale) =>
          sale.channel === "MOBILE" ||
          String(sale.receiptNumber || "").startsWith("MOB-")
      )
      .map((sale) => sale._id.toString())
  );

  const lines = saleIds.length
    ? await SaleLineModel.find({ saleId: { $in: saleIds } })
        .select(
          "saleId source categoryName productName qty price lineTotal unitCost stockUnit packSize stockPcsOut baseQty"
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
    };

    const qty = Number(line.qty || 0);
    const revenue = Number(line.lineTotal || 0);
    const stockUnits = Number(line.baseQty ?? line.stockPcsOut ?? qty);
    if (line.stockUnit === "PACK") {
      bucket.packUnits += qty;
      bucket.packRevenue = roundMoney(bucket.packRevenue + revenue);
    } else {
      bucket.pieceUnits += qty;
      bucket.pieceRevenue = roundMoney(bucket.pieceRevenue + revenue);
    }
    bucket.stockUnitsOut += stockUnits;
    if (!mobileSaleIds.has(line.saleId?.toString() || "")) {
      bucket.cogs = roundMoney(
        bucket.cogs + stockUnits * Number(line.unitCost || 0)
      );
    }
    buckets.set(key, bucket);
  }

  const products = [...buckets.values()]
    .map((bucket) => {
      const grossSales = roundMoney(bucket.packRevenue + bucket.pieceRevenue);
      const cogs = roundMoney(bucket.cogs);
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
        cogs,
        grossProfit: roundMoney(grossSales - cogs),
      };
    })
    .sort((a, b) => b.grossSales - a.grossSales || a.productName.localeCompare(b.productName));

  const outletCogsMap = await cogsByOutlet(start, end);
  const outletCogs = roundMoney(
    [...outletCogsMap.values()].reduce((sum, value) => sum + value, 0)
  );
  const grossSales = roundMoney(
    products.reduce((sum, product) => sum + product.grossSales, 0)
  );
  const productCogs = roundMoney(
    products.reduce((sum, product) => sum + product.cogs, 0)
  );
  const totalCogs = roundMoney(productCogs + outletCogs);
  const grossProfit = roundMoney(grossSales - totalCogs);

  const expenseRows = await ExpenseModel.aggregate<{
    _id: string;
    total?: number;
  }>([
    {
      $match: {
        isActive: true,
        expenseDate: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: "$type", total: { $sum: "$amount" } } },
  ]);
  const expenseMap = new Map(
    expenseRows.map((expense) => [
      String(expense._id || "OTHERS"),
      roundMoney(Number(expense.total || 0)),
    ])
  );
  const expenseTypes = [
    "DELIVERY_EXPENSES",
    "CLEANING_SUPPLIES",
    "TRANSPORTATION_EXPENSES",
    "MARINATE_EXPENSES",
    "OFFICE_SUPPLIES",
    "REPAIR_AND_MAINTENANCE",
    "SALARIES",
    "INCENTIVES_AND_ALLOWANCES",
    "OTHERS",
  ];
  const expenses = expenseTypes.map((type) => ({
    type,
    total: expenseMap.get(type) || 0,
  }));
  const totalOperatingExpenses = roundMoney(
    expenses.reduce((sum, expense) => sum + expense.total, 0)
  );
  const netIncome = roundMoney(grossProfit - totalOperatingExpenses);

  return NextResponse.json({
    success: true,
    range: { start: start.toISOString(), end: end.toISOString() },
    generatedAt: manilaDateString(),
    products,
    totals: {
      packUnits: products.reduce((sum, product) => sum + product.packUnits, 0),
      packSales: roundMoney(products.reduce((sum, product) => sum + product.packRevenue, 0)),
      pieceUnits: products.reduce((sum, product) => sum + product.pieceUnits, 0),
      pieceSales: roundMoney(products.reduce((sum, product) => sum + product.pieceRevenue, 0)),
      grossSales,
      productCogs,
      outletCogs,
      totalCogs,
      grossProfit,
      totalOperatingExpenses,
      netIncome,
      profitabilityRatio: grossSales > 0 ? Math.round((netIncome / grossSales) * 10000) / 100 : 0,
    },
    expenses,
  });
}
