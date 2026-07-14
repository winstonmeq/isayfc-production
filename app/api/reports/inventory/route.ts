// app/api/reports/inventory/route.ts
//
// Standard Inventory Valuation Report (stock-on-hand). A point-in-time snapshot
// valuing each active product's current stock at cost (buyingPrice) and at
// retail (unitPrice), with category subtotals, a grand total, and low/zero
// stock flags. Inventory valuation is "as of now", so it takes no date range.

import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { roundMoney } from "@/lib/report-utils";
import { manilaDateString } from "@/lib/date-utils";
import ProductModel from "@/models/Product";
import CategoryModel from "@/models/Category";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("reports.inventory");
  if (response) return response;

  await dbConnect();
  void CategoryModel; // register for populate

  const { searchParams } = new URL(req.url);
  const stockParam = String(searchParams.get("stock") || "").toLowerCase();
  // Optional filter: "low" (at or below alert), "zero", or "in" (has stock).
  const stockFilter =
    stockParam === "low" || stockParam === "zero" || stockParam === "in"
      ? stockParam
      : null;

  const products = await ProductModel.find({ isActive: true })
    .populate("categoryId", "name")
    .select("name categoryId buyingPrice unitPrice stockPcs lowStockAlert")
    .sort({ name: 1 })
    .lean<
      Array<{
        _id: { toString: () => string };
        name?: string;
        categoryId?: { _id?: { toString: () => string }; name?: string } | null;
        buyingPrice?: number;
        unitPrice?: number;
        stockPcs?: number;
        lowStockAlert?: number;
      }>
    >();

  type Row = {
    id: string;
    name: string;
    categoryName: string;
    stockPcs: number;
    buyingPrice: number;
    unitPrice: number;
    costValue: number;
    retailValue: number;
    potentialMargin: number;
    lowStockAlert: number;
    stockStatus: "OUT" | "LOW" | "OK";
  };

  const allRows: Row[] = products.map((p) => {
    const stock = Number(p.stockPcs || 0);
    const cost = Number(p.buyingPrice || 0);
    const retail = Number(p.unitPrice || 0);
    const alert = Number(p.lowStockAlert || 0);
    const costValue = roundMoney(stock * cost);
    const retailValue = roundMoney(stock * retail);
    const stockStatus: Row["stockStatus"] =
      stock <= 0 ? "OUT" : alert > 0 && stock <= alert ? "LOW" : "OK";
    return {
      id: p._id.toString(),
      name: String(p.name || ""),
      categoryName: p.categoryId?.name || "NO CATEGORY",
      stockPcs: stock,
      buyingPrice: cost,
      unitPrice: retail,
      costValue,
      retailValue,
      potentialMargin: roundMoney(retailValue - costValue),
      lowStockAlert: alert,
      stockStatus,
    };
  });

  const rows = stockFilter
    ? allRows.filter((r) =>
        stockFilter === "zero"
          ? r.stockStatus === "OUT"
          : stockFilter === "low"
            ? r.stockStatus === "LOW"
            : r.stockPcs > 0
      )
    : allRows;

  // Category subtotals (over the filtered rows).
  const catMap = new Map<
    string,
    { categoryName: string; items: number; stockPcs: number; costValue: number; retailValue: number }
  >();
  for (const r of rows) {
    const cur =
      catMap.get(r.categoryName) ||
      {
        categoryName: r.categoryName,
        items: 0,
        stockPcs: 0,
        costValue: 0,
        retailValue: 0,
      };
    cur.items += 1;
    cur.stockPcs += r.stockPcs;
    cur.costValue = roundMoney(cur.costValue + r.costValue);
    cur.retailValue = roundMoney(cur.retailValue + r.retailValue);
    catMap.set(r.categoryName, cur);
  }
  const categories = [...catMap.values()].sort((a, b) =>
    a.categoryName.localeCompare(b.categoryName)
  );

  const grand = rows.reduce(
    (acc, r) => {
      acc.items += 1;
      acc.stockPcs += r.stockPcs;
      acc.costValue = roundMoney(acc.costValue + r.costValue);
      acc.retailValue = roundMoney(acc.retailValue + r.retailValue);
      if (r.stockStatus === "OUT") acc.outOfStock += 1;
      else if (r.stockStatus === "LOW") acc.lowStock += 1;
      return acc;
    },
    { items: 0, stockPcs: 0, costValue: 0, retailValue: 0, lowStock: 0, outOfStock: 0 }
  );

  return NextResponse.json({
    success: true,
    generatedAt: manilaDateString(),
    rows,
    categories,
    grand: {
      ...grand,
      potentialMargin: roundMoney(grand.retailValue - grand.costValue),
    },
  });
}
