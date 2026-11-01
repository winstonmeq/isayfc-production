import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import BodegaProduct from "@/models/BodegaProduct";
import Product from "@/models/Product";
import OutletInventory from "@/models/OutletInventory";

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(["inventory-adjustments.view", "inventory-adjustments.manage"]);
  if (response) return response;
  await dbConnect();
  const type = (new URL(req.url).searchParams.get("type") || "BODEGA").toUpperCase();
  const rows: any[] = type === "GROCERY"
    ? await Product.find({ isActive: true }).select("name stockPcs").sort({ name: 1 }).lean()
    : type === "OUTLET"
      ? await OutletInventory.find({ isActive: true }).populate("outletId", "name code").select("productName stockQty unitLabel outletId").sort({ productName: 1 }).lean()
      : await BodegaProduct.find({ isActive: true }).select("name stockQty").sort({ name: 1 }).lean();
  return NextResponse.json({ success: true, data: rows.map((row: any) => ({ _id: row._id.toString(), name: type === "OUTLET" ? `${row.productName} — ${row.outletId?.name || "Outlet"}` : row.name, quantity: Number(type === "GROCERY" ? row.stockPcs : type === "OUTLET" ? row.stockQty : row.stockQty), unit: type === "OUTLET" ? row.unitLabel : type === "GROCERY" ? "PCS" : "BASE" })) });
}
