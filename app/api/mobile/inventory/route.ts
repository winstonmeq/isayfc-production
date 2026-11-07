// app/api/mobile/inventory/route.ts
import { NextRequest, NextResponse } from "next/server";

import { requireMobileAuth } from "@/lib/mobile-auth";
import connectDb from "@/lib/mongodb";
import OutletInventoryModel from "@/models/OutletInventory";
import { classifyOutletInventoryRows } from "@/lib/outlet-product-classification";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, [
    "pos.view",
    "pos.manage",
    "outlet-inventory.view",
    "sales.view",
  ]);
  if (response) return response;

  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  await connectDb();

  const items = await OutletInventoryModel.find({
    outletId: user.outlet.id,
    isActive: true,
  })
    .sort({ productName: 1 })
    .lean();

  const data = (await classifyOutletInventoryRows(items)).map((it) => ({
    id: it._id.toString(),
    productName: it.productName || "",
    categoryName: it.categoryName || "",
    productSource: it.productSource,
    buyingPrice: Number(it.buyingPrice || 0),
    sellingPrice: Number(it.sellingPrice || 0),
    stockQty: Number(it.stockQty || 0),
    unitLabel: it.unitLabel || "QTY",
    packSize: Number(it.packSize || 0),
    lowStockAlert: Number(it.lowStockAlert || 0),
  }));

  return NextResponse.json({ success: true, outlet: user.outlet, data });
}
