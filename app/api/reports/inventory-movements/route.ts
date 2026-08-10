import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import {
  formatStock,
  packingSnapshot,
  type PackingSnapshot,
} from "@/lib/inventory-units";
import { manilaDateString } from "@/lib/date-utils";
import { parseReportRange } from "@/lib/report-utils";
import { requirePermission } from "@/lib/require-permission";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletModel from "@/models/Outlet";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import ProductModel from "@/models/Product";
import StandardPackingModel from "@/models/StandardPacking";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MovementRow = {
  id: string;
  source: "GROCERY" | "BODEGA" | "OUTLET";
  location: string;
  productName: string;
  categoryName: string;
  packing: PackingSnapshot;
  current: number;
  opening: number;
  stockIn: number;
  salesOut: number;
  deductions: number;
  otherOut: number;
  adjustment: number;
  closing: number;
  movementCount: number;
};

type LedgerMovement = {
  key: string;
  at: Date;
  type: string;
  referenceType: string;
  delta: number;
};

function idString(value: unknown) {
  return value && typeof value === "object" && "toString" in value
    ? String((value as { toString: () => string }).toString())
    : String(value || "");
}

function movementDelta(previous: unknown, next: unknown) {
  return Number(next || 0) - Number(previous || 0);
}

function formatMovement(value: number, packing: PackingSnapshot) {
  const sign = value < 0 ? "-" : "";
  return `${sign}${formatStock(Math.abs(value), packing)}`;
}

function addMovement(row: MovementRow, movement: LedgerMovement, end: Date) {
  if (movement.at >= end) {
    row.closing -= movement.delta;
    return;
  }

  row.movementCount += 1;
  const delta = movement.delta;
  if (movement.type === "ADJUSTMENT") {
    row.adjustment += delta;
  } else if (delta >= 0) {
    row.stockIn += delta;
  } else if (movement.type === "SALE") {
    row.salesOut += Math.abs(delta);
  } else if (
    movement.type === "STOCK_OUT" &&
    movement.referenceType === "MANUAL_DEDUCTION"
  ) {
    row.deductions += Math.abs(delta);
  } else {
    row.otherOut += Math.abs(delta);
  }
}

function serialize(row: MovementRow) {
  return {
    id: row.id,
    source: row.source,
    location: row.location,
    productName: row.productName,
    categoryName: row.categoryName,
    baseUnit: row.packing.baseUnit,
    packingUnit: row.packing.unit,
    multiplier: row.packing.multiplier,
    opening: row.opening,
    openingDisplay: formatStock(row.opening, row.packing),
    stockIn: row.stockIn,
    stockInDisplay: formatMovement(row.stockIn, row.packing),
    salesOut: row.salesOut,
    salesOutDisplay: formatMovement(row.salesOut, row.packing),
    deductions: row.deductions,
    deductionsDisplay: formatMovement(row.deductions, row.packing),
    otherOut: row.otherOut,
    otherOutDisplay: formatMovement(row.otherOut, row.packing),
    adjustment: row.adjustment,
    adjustmentDisplay: formatMovement(row.adjustment, row.packing),
    closing: row.closing,
    closingDisplay: formatStock(row.closing, row.packing),
    movementCount: row.movementCount,
  };
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("reports.inventory");
  if (response) return response;

  await dbConnect();
  void OutletModel;

  const { searchParams } = new URL(req.url);
  const { start, end } = parseReportRange(searchParams);

  const [
    groceries,
    bodegaProducts,
    outletInventory,
    packingStandards,
    groceryTransactions,
    bodegaTransactions,
    outletTransactions,
  ] = await Promise.all([
    ProductModel.find({ isActive: true })
      .populate("categoryId", "name")
      .select(
        "name categoryId stockPcs stockBags stockKilos"
      )
      .lean(),
    BodegaProductModel.find({ isActive: true })
      .populate("categoryId", "name")
      .select("name categoryId stockQty")
      .lean(),
    OutletInventoryModel.find({ isActive: true })
      .populate("outletId", "name code")
      .select(
        "outletId productName categoryName stockQty unitLabel packSize"
      )
      .lean(),
    StandardPackingModel.find({
      isActive: true,
      standardPacking: { $gt: 0 },
    })
      .select("productId standardPacking")
      .sort({ updatedAt: -1, _id: -1 })
      .lean(),
    InventoryTransactionModel.find({
      $or: [
        { transactionDate: { $gte: start } },
        { transactionDate: { $exists: false }, createdAt: { $gte: start } },
      ],
    })
      .select(
        "productId unit type previousStock newStock referenceType transactionDate createdAt"
      )
      .lean(),
    BodegaStockTransactionModel.find({
      $or: [
        { transactionDate: { $gte: start } },
        { transactionDate: { $exists: false }, createdAt: { $gte: start } },
      ],
    })
      .select(
        "bodegaProductId type previousStock newStock referenceType transactionDate createdAt"
      )
      .lean(),
    OutletStockTransactionModel.find({
      transactionDate: { $gte: start },
    })
      .select(
        "outletInventoryId type previousStock newStock referenceType transactionDate"
      )
      .lean(),
  ]);

  const packSizeByProduct = new Map<string, number>();
  for (const standard of packingStandards) {
    const productId = idString(standard.productId);
    if (productId && !packSizeByProduct.has(productId)) {
      packSizeByProduct.set(
        productId,
        Math.max(1, Math.trunc(Number(standard.standardPacking || 1)))
      );
    }
  }

  const rows = new Map<string, MovementRow>();
  const createRow = (
    key: string,
    input: Omit<
      MovementRow,
      | "id"
      | "opening"
      | "stockIn"
      | "salesOut"
      | "deductions"
      | "otherOut"
      | "adjustment"
      | "closing"
      | "movementCount"
    >
  ) => {
    const row: MovementRow = {
      id: key,
      ...input,
      opening: input.current,
      stockIn: 0,
      salesOut: 0,
      deductions: 0,
      otherOut: 0,
      adjustment: 0,
      closing: input.current,
      movementCount: 0,
    };
    rows.set(key, row);
  };

  for (const product of groceries as any[]) {
    const id = idString(product._id);
    const categoryName = product.categoryId?.name || "NO CATEGORY";
    const units = [
      ["PCS", Number(product.stockPcs || 0), "PCS"],
      ["BAGS", Number(product.stockBags || 0), "QTY"],
      ["KILOS", Number(product.stockKilos || 0), "KG"],
    ] as const;
    for (const [ledgerUnit, current, baseUnit] of units) {
      createRow(`GROCERY:${id}:${ledgerUnit}`, {
        source: "GROCERY",
        location: "MAIN",
        productName: `${product.name} (${ledgerUnit})`,
        categoryName,
        packing: packingSnapshot({
          unit: baseUnit,
          baseUnit,
        }),
        current,
      });
    }
  }

  for (const product of bodegaProducts as any[]) {
    const id = idString(product._id);
    const packSize = packSizeByProduct.get(id) || 0;
    createRow(`BODEGA:${id}`, {
      source: "BODEGA",
      location: "MAIN BODEGA",
      productName: String(product.name || ""),
      categoryName: product.categoryId?.name || "NO CATEGORY",
      packing: packingSnapshot({
        unit: packSize > 0 ? "PACK" : "PCS",
        baseUnit: "PCS",
        multiplier: packSize,
      }),
      current: Number(product.stockQty || 0),
    });
  }

  for (const inventory of outletInventory as any[]) {
    const id = idString(inventory._id);
    const packSize = Number(inventory.packSize || 0);
    const rawUnit = String(inventory.unitLabel || "QTY").toUpperCase();
    const unit =
      packSize > 0
        ? rawUnit === "BAG"
          ? "BAG"
          : "PACK"
        : rawUnit === "KG"
          ? "KG"
          : rawUnit === "PCS"
            ? "PCS"
            : "QTY";
    createRow(`OUTLET:${id}`, {
      source: "OUTLET",
      location:
        inventory.outletId?.name || inventory.outletId?.code || "OUTLET",
      productName: String(inventory.productName || ""),
      categoryName: inventory.categoryName || "NO CATEGORY",
      packing: packingSnapshot({
        unit,
        baseUnit: unit === "KG" ? "KG" : unit === "QTY" ? "QTY" : "PCS",
        multiplier: packSize,
      }),
      current: Number(inventory.stockQty || 0),
    });
  }

  const movements: LedgerMovement[] = [
    ...(groceryTransactions as any[]).map((transaction) => ({
      key: `GROCERY:${idString(transaction.productId)}:${transaction.unit}`,
      at: new Date(transaction.transactionDate || transaction.createdAt),
      type: String(transaction.type || ""),
      referenceType: String(transaction.referenceType || ""),
      delta: movementDelta(transaction.previousStock, transaction.newStock),
    })),
    ...(bodegaTransactions as any[]).map((transaction) => ({
      key: `BODEGA:${idString(transaction.bodegaProductId)}`,
      at: new Date(transaction.transactionDate || transaction.createdAt),
      type: String(transaction.type || ""),
      referenceType: String(transaction.referenceType || ""),
      delta: movementDelta(transaction.previousStock, transaction.newStock),
    })),
    ...(outletTransactions as any[]).map((transaction) => ({
      key: `OUTLET:${idString(transaction.outletInventoryId)}`,
      at: new Date(transaction.transactionDate),
      type: String(transaction.type || ""),
      referenceType: String(transaction.referenceType || ""),
      delta: movementDelta(transaction.previousStock, transaction.newStock),
    })),
  ];

  for (const movement of movements) {
    const row = rows.get(movement.key);
    if (row) addMovement(row, movement, end);
  }

  for (const row of rows.values()) {
    row.opening =
      row.closing -
      row.stockIn -
      row.adjustment +
      row.salesOut +
      row.deductions +
      row.otherOut;
  }

  const data = [...rows.values()]
    .filter(
      (row) =>
        row.opening !== 0 ||
        row.closing !== 0 ||
        row.movementCount > 0
    )
    .sort(
      (a, b) =>
        a.location.localeCompare(b.location) ||
        a.productName.localeCompare(b.productName)
    )
    .map(serialize);

  const summary = data.reduce(
    (total, row) => ({
      products: total.products + 1,
      movementCount: total.movementCount + row.movementCount,
      stockIn: total.stockIn + row.stockIn,
      salesOut: total.salesOut + row.salesOut,
      deductions: total.deductions + row.deductions,
      otherOut: total.otherOut + row.otherOut,
    }),
    {
      products: 0,
      movementCount: 0,
      stockIn: 0,
      salesOut: 0,
      deductions: 0,
      otherOut: 0,
    }
  );

  return NextResponse.json({
    success: true,
    range: { start: start.toISOString(), end: end.toISOString() },
    generatedAt: manilaDateString(),
    data,
    summary,
  });
}
