import { NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import BodegaProductModel from "@/models/BodegaProduct";
import BodegaStockTransactionModel from "@/models/BodegaStockTransaction";
import CustomerInventoryModel from "@/models/CustomerInventory";
import CustomerInventoryTransactionModel from "@/models/CustomerInventoryTransaction";
import InventoryTransactionModel from "@/models/InventoryTransaction";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import ProductModel from "@/models/Product";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ReconciliationRow = {
  source: "GROCERY" | "BODEGA" | "OUTLET" | "CUSTOMER";
  inventoryId: string;
  productName: string;
  unit: string;
  masterStock: number;
  ledgerStock: number | null;
  difference: number | null;
  hasLedger: boolean;
  chainBreaks: number;
  status: "OK" | "NO_LEDGER" | "MISMATCH" | "BROKEN_CHAIN";
};

const id = (value: unknown) => String(value || "");
const number = (value: unknown) => Number(value || 0);
const equal = (left: number, right: number) => Math.abs(left - right) < 0.000001;

function result(
  base: Omit<ReconciliationRow, "ledgerStock" | "difference" | "hasLedger" | "chainBreaks" | "status">,
  ledgers: Array<{ previousStock?: unknown; newStock?: unknown }>
): ReconciliationRow {
  let chainBreaks = 0;
  for (let index = 1; index < ledgers.length; index += 1) {
    if (!equal(number(ledgers[index - 1].newStock), number(ledgers[index].previousStock))) {
      chainBreaks += 1;
    }
  }

  const latest = ledgers.at(-1);
  const ledgerStock = latest ? number(latest.newStock) : null;
  const difference = ledgerStock === null ? null : base.masterStock - ledgerStock;
  const status = ledgerStock === null
    ? "NO_LEDGER"
    : !equal(difference || 0, 0)
      ? "MISMATCH"
      : chainBreaks > 0
        ? "BROKEN_CHAIN"
        : "OK";

  return {
    ...base,
    ledgerStock,
    difference,
    hasLedger: ledgerStock !== null,
    chainBreaks,
    status,
  };
}

export async function GET() {
  const { response } = await requirePermission("reports.inventory");
  if (response) return response;

  await dbConnect();

  const [
    groceries,
    bodega,
    outlets,
    customers,
    groceryLedger,
    bodegaLedger,
    outletLedger,
    customerLedger,
  ] = await Promise.all([
    ProductModel.find({ isActive: true }).select("name stockPcs stockBags stockKilos").lean(),
    BodegaProductModel.find({ isActive: true }).select("name stockQty").lean(),
    OutletInventoryModel.find({ isActive: true }).select("productName stockQty unitLabel").lean(),
    CustomerInventoryModel.find({ isActive: true }).select("productName stockQty stockUnit").lean(),
    InventoryTransactionModel.find({})
      .select("productId unit previousStock newStock createdAt")
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
    BodegaStockTransactionModel.find({})
      .select("bodegaProductId previousStock newStock createdAt")
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
    OutletStockTransactionModel.find({})
      .select("outletInventoryId previousStock newStock createdAt")
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
    CustomerInventoryTransactionModel.find({})
      .select("customerInventoryId previousStock newStock createdAt")
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
  ]);

  const groceryByKey = new Map<string, any[]>();
  for (const entry of groceryLedger as any[]) {
    const key = `${id(entry.productId)}:${entry.unit}`;
    groceryByKey.set(key, [...(groceryByKey.get(key) || []), entry]);
  }
  const byId = (entries: any[], field: string) => {
    const map = new Map<string, any[]>();
    for (const entry of entries) {
      const key = id(entry[field]);
      map.set(key, [...(map.get(key) || []), entry]);
    }
    return map;
  };
  const bodegaById = byId(bodegaLedger as any[], "bodegaProductId");
  const outletById = byId(outletLedger as any[], "outletInventoryId");
  const customerById = byId(customerLedger as any[], "customerInventoryId");

  const rows: ReconciliationRow[] = [];
  for (const product of groceries as any[]) {
    for (const [unit, field] of [["PCS", "stockPcs"], ["BAGS", "stockBags"], ["KILOS", "stockKilos"]] as const) {
      rows.push(result({
        source: "GROCERY",
        inventoryId: id(product._id),
        productName: product.name,
        unit,
        masterStock: number(product[field]),
      }, groceryByKey.get(`${id(product._id)}:${unit}`) || []));
    }
  }
  for (const product of bodega as any[]) {
    rows.push(result({
      source: "BODEGA",
      inventoryId: id(product._id),
      productName: product.name,
      unit: "PCS",
      masterStock: number(product.stockQty),
    }, bodegaById.get(id(product._id)) || []));
  }
  for (const inventory of outlets as any[]) {
    rows.push(result({
      source: "OUTLET",
      inventoryId: id(inventory._id),
      productName: inventory.productName,
      unit: inventory.unitLabel,
      masterStock: number(inventory.stockQty),
    }, outletById.get(id(inventory._id)) || []));
  }
  for (const inventory of customers as any[]) {
    rows.push(result({
      source: "CUSTOMER",
      inventoryId: id(inventory._id),
      productName: inventory.productName,
      unit: inventory.stockUnit,
      masterStock: number(inventory.stockQty),
    }, customerById.get(id(inventory._id)) || []));
  }

  const summary = rows.reduce((acc, row) => {
    acc[row.status] += 1;
    return acc;
  }, { OK: 0, NO_LEDGER: 0, MISMATCH: 0, BROKEN_CHAIN: 0 });

  return NextResponse.json({
    success: true,
    reconciledAt: new Date().toISOString(),
    summary: { total: rows.length, ...summary },
    balanced: summary.MISMATCH === 0 && summary.BROKEN_CHAIN === 0,
    data: rows,
  });
}
