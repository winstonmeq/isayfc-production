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
import ProductModel from "@/models/Product";
import CategoryModel from "@/models/Category";
import BodegaProductModel from "@/models/BodegaProduct";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletModel from "@/models/Outlet";
import StandardPackingModel from "@/models/StandardPacking";
import SlicingItemModel from "@/models/SlicingItem";
import {
  formatStock,
  packingSnapshot,
  toBaseUnitCost,
} from "@/lib/inventory-units";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("reports.inventory");
  if (response) return response;

  await dbConnect();
  void CategoryModel; // register for populate

  const { searchParams } = new URL(req.url);
  const stockParam = String(searchParams.get("stock") || "").toLowerCase();
  const categoryFilter = String(searchParams.get("category") || "")
    .trim()
    .toUpperCase();
  // Optional filter: "low" (at or below alert), "zero", or "in" (has stock).
  const stockFilter =
    stockParam === "low" || stockParam === "zero" || stockParam === "in"
      ? stockParam
      : null;

  void OutletModel;

  const [products, bodegaProducts, outletInventory, packingStandards] =
    await Promise.all([
    ProductModel.find({ isActive: true })
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
      >(),
    BodegaProductModel.find({ isActive: true })
      .populate("categoryId", "name")
      .select("name categoryId buyingPrice sellingPrice stockQty")
      .sort({ name: 1 })
      .lean(),
    OutletInventoryModel.find({ isActive: true })
      .populate("outletId", "name code")
      .select(
        "outletId productSource productId productName categoryName stockQty unitLabel packSize lowStockAlert buyingPrice sellingPrice"
      )
      .sort({ productName: 1 })
      .lean(),
    StandardPackingModel.find({
      isActive: true,
      standardPacking: { $gt: 0 },
    })
      .select("productId wholeChickenId standardPacking")
      .sort({ updatedAt: -1, _id: -1 })
      .lean(),
    ]);
  const packSizeByProduct = new Map<string, number>();
  const wholeChickenProductIds = new Set<string>();
  for (const standard of packingStandards) {
    const productId = standard.productId?.toString();
    if (productId && !packSizeByProduct.has(productId)) {
      packSizeByProduct.set(
        productId,
        Math.max(0, Math.trunc(Number(standard.standardPacking || 0)))
      );
    }
    const wholeChickenId = standard.wholeChickenId?.toString();
    if (wholeChickenId) wholeChickenProductIds.add(wholeChickenId);
  }

  // Older slicing records increased output stock without updating the sliced
  // product's buyingPrice. Use their recorded input cost as a valuation
  // fallback so existing C10/C65/C99 inventory is not incorrectly worth zero.
  const slicedCostRows = await SlicingItemModel.aggregate<{
    _id: unknown;
    totalInputCost: number;
    totalOutputPcs: number;
  }>([
    {
      $match: {
        slicedProductId: { $in: bodegaProducts.map((product: any) => product._id) },
        actualSlicedPcs: { $gt: 0 },
        inputCost: { $gt: 0 },
      },
    },
    {
      $lookup: {
        from: "slicingbatches",
        localField: "batchId",
        foreignField: "_id",
        as: "batch",
      },
    },
    { $unwind: "$batch" },
    { $match: { "batch.isVoided": { $ne: true } } },
    {
      $group: {
        _id: "$slicedProductId",
        totalInputCost: { $sum: "$inputCost" },
        totalOutputPcs: { $sum: "$actualSlicedPcs" },
      },
    },
  ]);
  const slicedBaseCostByProduct = new Map(
    slicedCostRows.map((row) => [
      String(row._id),
      row.totalOutputPcs > 0 ? row.totalInputCost / row.totalOutputPcs : 0,
    ])
  );

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
    source: "GROCERY" | "BODEGA" | "OUTLET";
    location: string;
    unitLabel: string;
    baseUnit: "HEAD" | "PCS" | "KG" | "QTY";
    packSize: number;
    packCost: number;
    stockDisplay: string;
  };

  const groceryRows: Row[] = products.map((p) => {
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
      source: "GROCERY",
      location: "MAIN",
      unitLabel: "QTY",
      baseUnit: "QTY",
      packSize: 0,
      packCost: 0,
      stockDisplay: formatStock(
        stock,
        packingSnapshot({ unit: "QTY", baseUnit: "QTY" })
      ),
    };
  });

  const bodegaRows: Row[] = bodegaProducts.map((product: any) => {
    const stock = Number(product.stockQty || 0);
    const savedCost = Number(product.buyingPrice || 0);
    const sellingPrice = Number(product.sellingPrice || 0);
    const packSize = packSizeByProduct.get(product._id.toString()) || 0;
    const isWholeChicken = wholeChickenProductIds.has(product._id.toString());
    const baseUnit = isWholeChicken ? "HEAD" : "PCS";
    const packing = packingSnapshot({
      unit: packSize > 0 ? "PACK" : baseUnit,
      baseUnit,
      multiplier: packSize,
    });
    const recordedBaseCost = toBaseUnitCost(savedCost, packing);
    const cost =
      recordedBaseCost > 0
        ? recordedBaseCost
        : slicedBaseCostByProduct.get(product._id.toString()) || 0;
    const retail = toBaseUnitCost(sellingPrice, packing);
    const costValue = roundMoney(stock * cost);
    const retailValue = roundMoney(stock * retail);
    return {
      id: product._id.toString(),
      name: String(product.name || ""),
      categoryName: product.categoryId?.name || "NO CATEGORY",
      stockPcs: stock,
      buyingPrice: cost,
      unitPrice: retail,
      costValue,
      retailValue,
      potentialMargin: roundMoney(retailValue - costValue),
      lowStockAlert: 0,
      stockStatus: stock <= 0 ? "OUT" : "OK",
      source: "BODEGA",
      location: "MAIN BODEGA",
      unitLabel: packSize > 0 ? "PACK" : baseUnit,
      baseUnit,
      packSize,
      packCost: packSize > 0 ? roundMoney(cost * packSize) : 0,
      stockDisplay: formatStock(stock, packing),
    };
  });

  const groceryCostById = new Map(
    groceryRows.map((row) => [row.id, row.buyingPrice])
  );
  const bodegaCostById = new Map(
    bodegaRows.map((row) => [row.id, row.buyingPrice])
  );

  const outletRows: Row[] = outletInventory.map((inventory: any) => {
    const stock = Number(inventory.stockQty || 0);
    const packSize = Number(inventory.packSize || 0);
    const savedCost = Number(inventory.buyingPrice || 0);
    const savedRetail = Number(inventory.sellingPrice || 0);
    const packing = packingSnapshot({
      unit:
        packSize > 0
          ? inventory.unitLabel === "BAG"
            ? "BAG"
            : "PACK"
          : inventory.unitLabel || "QTY",
      baseUnit:
        inventory.unitLabel === "KG"
          ? "KG"
          : inventory.unitLabel === "HEAD"
            ? "HEAD"
            : inventory.productSource === "GROCERY"
              ? "QTY"
              : "PCS",
      multiplier: packSize,
    });
    const recordedCost = toBaseUnitCost(savedCost, packing);
    const sourceId = inventory.productId?.toString?.() || "";
    const sourceCost =
      inventory.productSource === "GROCERY"
        ? groceryCostById.get(sourceId) || 0
        : bodegaCostById.get(sourceId) || 0;
    // Older outlet balances may predate cost snapshots. Value them using the
    // linked source master's current base-unit cost instead of reporting zero.
    const cost = recordedCost > 0 ? recordedCost : sourceCost;
    const retail = toBaseUnitCost(savedRetail, packing);
    const alert = Number(inventory.lowStockAlert || 0);
    const costValue = roundMoney(stock * cost);
    const retailValue = roundMoney(stock * retail);
    const outletName =
      inventory.outletId?.name || inventory.outletId?.code || "OUTLET";
    return {
      id: inventory._id.toString(),
      name: `${String(inventory.productName || "")} (${outletName})`,
      categoryName: inventory.categoryName || "NO CATEGORY",
      stockPcs: stock,
      buyingPrice: cost,
      unitPrice: retail,
      costValue,
      retailValue,
      potentialMargin: roundMoney(retailValue - costValue),
      lowStockAlert: alert,
      stockStatus:
        stock <= 0 ? "OUT" : alert > 0 && stock <= alert ? "LOW" : "OK",
      source: "OUTLET",
      location: String(outletName),
      unitLabel: packing.unit,
      baseUnit: packing.baseUnit,
      packSize: packing.multiplier > 1 ? packing.multiplier : 0,
      packCost:
        packing.multiplier > 1
          ? roundMoney(cost * packing.multiplier)
          : 0,
      stockDisplay: formatStock(stock, packing),
    };
  });

  const allRows = [...groceryRows, ...bodegaRows, ...outletRows].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const categoryOptions = [
    ...new Set(allRows.map((row) => row.categoryName).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const stockRows = stockFilter
    ? allRows.filter((r) =>
        stockFilter === "zero"
          ? r.stockStatus === "OUT"
          : stockFilter === "low"
            ? r.stockStatus === "LOW"
            : r.stockPcs > 0
      )
    : allRows;
  const rows = categoryFilter
    ? stockRows.filter(
        (row) => row.categoryName.trim().toUpperCase() === categoryFilter
      )
    : stockRows;

  // Category subtotals (over the filtered rows).
  const catMap = new Map<
    string,
    {
      categoryName: string;
      items: number;
      stockByUnit: Record<string, number>;
      costValue: number;
      retailValue: number;
    }
  >();
  for (const r of rows) {
    const cur =
      catMap.get(r.categoryName) ||
      {
        categoryName: r.categoryName,
        items: 0,
        stockByUnit: {},
        costValue: 0,
        retailValue: 0,
      };
    cur.items += 1;
    cur.stockByUnit[r.baseUnit] =
      (cur.stockByUnit[r.baseUnit] || 0) + r.stockPcs;
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
      acc.stockByUnit[r.baseUnit] =
        (acc.stockByUnit[r.baseUnit] || 0) + r.stockPcs;
      acc.costValue = roundMoney(acc.costValue + r.costValue);
      acc.retailValue = roundMoney(acc.retailValue + r.retailValue);
      if (r.stockStatus === "OUT") acc.outOfStock += 1;
      else if (r.stockStatus === "LOW") acc.lowStock += 1;
      return acc;
    },
    {
      items: 0,
      stockByUnit: {} as Record<string, number>,
      costValue: 0,
      retailValue: 0,
      lowStock: 0,
      outOfStock: 0,
    }
  );

  return NextResponse.json({
    success: true,
    generatedAt: new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date()),
    rows,
    categories,
    categoryOptions,
    grand: {
      ...grand,
      potentialMargin: roundMoney(grand.retailValue - grand.costValue),
    },
  });
}
