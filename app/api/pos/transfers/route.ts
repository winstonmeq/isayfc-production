import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { requirePermission } from "@/lib/require-permission";
import StockTransferModel from "@/models/StockTransfer";
import StockTransferItemModel from "@/models/StockTransferItem";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { session, response } = await requirePermission(["pos.view", "pos.manage"]);
  if (response) return response;
  await dbConnect();

  const outletId = new URL(req.url).searchParams.get("outletId") || "";
  if (!isValidObjectId(outletId) || !(await findAuthorizedPosOutlet(session!.user.id, outletId))) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }

  const transfers = await StockTransferModel.find({ outletId, status: { $in: ["IN_TRANSIT", "DELIVERED", "CONFIRMED"] } })
    .sort({ transferDate: 1, createdAt: 1 })
    .lean<any[]>();
  const transferIds = transfers.map((row) => row._id);
  const items = transferIds.length
    ? await StockTransferItemModel.find({ transferId: { $in: transferIds } })
        .sort({ createdAt: 1 })
        .lean<any[]>()
    : [];

  const byTransfer = new Map<string, any[]>();
  for (const item of items) {
    const key = String(item.transferId);
    const unitPrice = Number(item.sellingPrice || 0) > 0 ? Number(item.sellingPrice) : Number(item.buyingPrice || 0);
    const qty = Number(item.qty || 0);
    const packSize = Number(item.packSize || 0);
    const unitLabel = (item.unitLabel || "PCS").toUpperCase();
    const source = (item.source === "GROCERY" ? "GROCERY" : "BODEGA") as "BODEGA" | "GROCERY";
    const lineTotal = qty * unitPrice;
    const baseUnit = item.baseUnit || (unitLabel === "HEAD" ? "HEAD" : source === "GROCERY" ? "QTY" : "PCS");
    const baseQty = Number(item.baseQty || (unitLabel === "PACK" && packSize > 0 ? qty * packSize : qty) || 0);

    const list = byTransfer.get(key) || [];
    list.push({
      id: item._id.toString(),
      itemStatus: item.itemStatus || "PENDING",
      remarks: item.remarks || "",
      productName: item.productName,
      categoryName: item.categoryName || "",
      source,
      qty,
      unitLabel,
      packSize,
      baseUnit,
      baseQty,
      price: unitPrice,
      totalAmount: lineTotal,
    });
    byTransfer.set(key, list);
  }

  return NextResponse.json({
    success: true,
    data: transfers.map((row) => {
      const transferItems = byTransfer.get(row._id.toString()) || [];
      const totalAmount = transferItems.reduce((acc, it) => acc + (it.totalAmount || 0), 0);
      const totalQty = transferItems.reduce((acc, it) => acc + (it.qty || 0), 0);
      return {
        id: row._id.toString(),
        transferNumber: row.transferNumber,
        status: row.status,
        transferDate: row.transferDate,
        remarks: row.remarks || "",
        totalItems: transferItems.length,
        totalQty,
        totalAmount,
        items: transferItems,
      };
    }),
  });
}
