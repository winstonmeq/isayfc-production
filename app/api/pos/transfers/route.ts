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

  const transfers = await StockTransferModel.find({ outletId, status: { $in: ["IN_TRANSIT", "DELIVERED"] } })
    .sort({ transferDate: 1, createdAt: 1 })
    .lean<any[]>();
  const transferIds = transfers.map((row) => row._id);
  const items = transferIds.length ? await StockTransferItemModel.find({ transferId: { $in: transferIds } }).sort({ createdAt: 1 }).lean<any[]>() : [];
  const byTransfer = new Map<string, any[]>();
  for (const item of items) {
    const key = String(item.transferId);
    byTransfer.set(key, [...(byTransfer.get(key) || []), {
      id: item._id.toString(), productName: item.productName, qty: Number(item.qty || 0),
      unitLabel: item.unitLabel || "PCS", packSize: Number(item.packSize || 0),
    }]);
  }

  return NextResponse.json({ success: true, data: transfers.map((row) => ({
    id: row._id.toString(), transferNumber: row.transferNumber, status: row.status,
    transferDate: row.transferDate, items: byTransfer.get(row._id.toString()) || [],
  })) });
}
