import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import BodegaProduct from "@/models/BodegaProduct";
import Product from "@/models/Product";
import OutletInventory from "@/models/OutletInventory";
import StandardPacking from "@/models/StandardPacking";

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(["inventory-adjustments.view", "inventory-adjustments.manage"]);
  if (response) return response;
  await dbConnect();
  const type = (new URL(req.url).searchParams.get("type") || "BODEGA").toUpperCase();
  const rows: any[] = type === "GROCERY"
    ? await Product.find({ isActive: true }).select("name stockPcs unitCode").sort({ name: 1 }).lean()
    : type === "OUTLET"
      ? await OutletInventory.find({ isActive: true }).populate("outletId", "name code").select("productName stockQty unitLabel outletId").sort({ productName: 1 }).lean()
      : await BodegaProduct.find({ isActive: true }).select("name stockQty stockHeads stockKilos unitCode").sort({ name: 1 }).lean();
  const standards = type === "BODEGA" ? await StandardPacking.find({ isActive: true }).select("wholeChickenId productId standardPacking").lean() : [];
  return NextResponse.json({ success: true, data: rows.map((row: any) => {
    const whole = type === "BODEGA" && (row.unitCode === "HEAD" || standards.some(s => String(s.wholeChickenId) === String(row._id)));
    const packSizes = [...new Set(standards.filter(s => String(s.productId) === String(row._id) && s.standardPacking > 0).map(s => s.standardPacking))];
    return { _id: row._id.toString(), name: type === "OUTLET" ? `${row.productName} — ${row.outletId?.name || "Outlet"}` : row.name,
      quantity: Number(type === "GROCERY" ? row.stockPcs : row.stockQty), unit: type === "OUTLET" ? row.unitLabel : whole ? "HEAD" : row.unitCode === "KG" ? "KG" : type === "GROCERY" ? row.unitCode || "PCS" : "PCS",
      whole, kilos: Number(row.stockKilos || 0), packSizes: whole ? [] : packSizes };
  }) });
}
