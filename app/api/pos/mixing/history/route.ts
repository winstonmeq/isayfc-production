import { NextRequest, NextResponse } from "next/server";
import { Types, isValidObjectId } from "mongoose";
import { requirePermission } from "@/lib/require-permission";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { escapeRegex } from "@/lib/crud-utils";
import { manilaDateString } from "@/lib/date-utils";
import { validCreditDate } from "@/lib/employee-credit-policy";
import { mixingBatchDetails, type MixingMovement } from "@/lib/mixing-history";
import Ledger from "@/models/OutletStockTransaction";
import User from "@/models/User";

export async function GET(req: NextRequest) {
  try {
    const { response, session } = await requirePermission("pos.view");
    if (response) return response;
    const params = req.nextUrl.searchParams, outletId = params.get("outletId") || "";
    if (!await findAuthorizedPosOutlet(session!.user.id, outletId)) return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 403 });
    const batchId = params.get("batchId");
    if (batchId) {
      if (!isValidObjectId(batchId)) return NextResponse.json({ success: false, message: "Invalid batch." }, { status: 400 });
      void User;
      const rows = await Ledger.find({ outletId, type: { $in: ["REPACK_IN", "REPACK_OUT"] }, $or: [{ referenceId: batchId }, { _id: batchId, referenceId: null }] }).sort({ type: 1, _id: 1 }).populate("createdBy", "name username").lean();
      if (!rows.length) return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
      return NextResponse.json({ success: true, batch: mixingBatchDetails(batchId, rows as unknown as MixingMovement[]) }, { headers: { "Cache-Control": "no-store" } });
    }
    const from = params.get("from") || "", to = params.get("to") || "", today = manilaDateString();
    if ((from && !validCreditDate(from, today)) || (to && !validCreditDate(to, today)) || (from && to && from > to)) return NextResponse.json({ success: false, message: "Select a valid date range." }, { status: 400 });
    const query = (params.get("search") || "").trim().slice(0, 160);
    const size = [25, 50, 100].includes(Number(params.get("limit"))) ? Number(params.get("limit")) : 25;
    const rawPage = Number(params.get("page") || 1), page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const match = { outletId: new Types.ObjectId(outletId), type: "REPACK_IN", ...(from || to ? { transactionDate: { ...(from ? { $gte: new Date(`${from}T00:00:00+08:00`) } : {}), ...(to ? { $lt: new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000) } : {}) } } : {}) };
    // Group complete output rows before product filtering/paging. No input row truncation.
    const grouped = [{ $match: match }, { $group: { _id: { $ifNull: ["$referenceId", "$_id"] }, date: { $max: "$transactionDate" }, outputs: { $push: { productName: "$productName", quantity: "$quantity", unitCost: "$unitCost", unit: "$baseUnit" } }, productionCost: { $sum: { $multiply: ["$quantity", "$unitCost"] } }, createdBy: { $first: "$createdBy" }, channel: { $first: "$sourceChannel" } } }, ...(query ? [{ $match: { "outputs.productName": new RegExp(escapeRegex(query), "i") } }] : [])];
    const counts = await Ledger.aggregate([...grouped, { $count: "total" }]);
    const total = Number(counts[0]?.total || 0), totalPages = Math.max(1, Math.ceil(total / size)), currentPage = Math.min(page, totalPages);
    const rows = await Ledger.aggregate([...grouped, { $sort: { date: -1, _id: -1 } }, { $skip: (currentPage - 1) * size }, { $limit: size }, { $lookup: { from: User.collection.name, localField: "createdBy", foreignField: "_id", pipeline: [{ $project: { name: 1, username: 1 } }], as: "creator" } }]);
    return NextResponse.json({ success: true, rows: rows.map(row => ({ id: String(row._id), batchNumber: `MIX-${String(row._id).toUpperCase()}`, date: row.date, outputs: row.outputs, productionCost: Math.round(Number(row.productionCost || 0) * 100) / 100, createdBy: row.creator[0]?.name || row.creator[0]?.username || "Unknown / legacy", channel: row.channel || "UNKNOWN", status: "Posted" })), page: currentPage, total, totalPages, limit: size }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ success: false, message: "Unable to load mixing history. Refresh and retry." }, { status: 503 }); }
}
