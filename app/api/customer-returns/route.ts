import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { escapeRegex } from "@/lib/crud-utils";
import Sale from "@/models/Sale";
import SaleLine from "@/models/SaleLine";
import Return from "@/models/MainCustomerReturn";
import AuditLog from "@/models/AuditLog";
import { customerReturnQuote } from "@/lib/customer-return-quantity";

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(["inventory-adjustments.view", "inventory-adjustments.manage"]);
  if (response) return response;
  await dbConnect();
  const receipt = req.nextUrl.searchParams.get("receipt")?.trim();
  if (receipt) {
    const sales = await Sale.find({ isVoided: false, source: { $in: ["CHICKEN", "BODEGA", "MIXED"] }, ownerOutletId: null, transactionType: { $ne: "INTERNAL_TRANSFER" }, fulfillmentStatus: { $ne: "PENDING" }, receiptNumber: { $regex: escapeRegex(receipt.slice(0, 80)), $options: "i" } }).select("receiptNumber customerId saleDate").sort({ saleDate: -1 }).limit(50).lean();
    const lines = await SaleLine.find({ saleId: { $in: sales.map(sale => sale._id) } }).select("saleId productName source qty stockUnit packSize baseQty lineTotal").lean();
    return NextResponse.json({ success: true, lines: lines.map(line => ({ id: String(line._id), receipt: sales.find(sale => String(sale._id) === String(line.saleId))?.receiptNumber, productName: line.productName, quantity: line.qty, unit: line.stockUnit || "QTY", netAmount: line.lineTotal })) });
  }
  const rows = await Return.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({ success: true, rows });
}
class ReturnError extends Error {}
export async function POST(req: NextRequest) {
  const { response, session: auth } = await requirePermission("inventory-adjustments.manage");
  if (response) return response;
  const body = await req.json().catch(() => null);
  const { saleLineId, quantity, condition, requestKey } = body || {};
  const reason = String(body?.reason || "").trim();
  if (!mongoose.isValidObjectId(saleLineId) || typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0 || !["RESTOCKABLE", "DAMAGED"].includes(condition) || reason.length < 5 || reason.length > 500 || !/^[\w-]{16,80}$/.test(requestKey || "")) return NextResponse.json({ success: false, message: "Select an original sale item, quantity, condition and reason." }, { status: 400 });
  await dbConnect();
  const id = new mongoose.Types.ObjectId(createHash("sha256").update(`main-return:${requestKey}`).digest("hex").slice(0, 24));
  const requestHash = createHash("sha256").update(JSON.stringify({ saleLineId, quantity, condition, reason })).digest("hex");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const prior = await Return.findById(id).session(session);
      if (prior) { if (prior.requestHash !== requestHash) throw new ReturnError("Request key already used. Refresh and retry."); return; }
      // Serialize requests for the same original sale line, including concurrent returns.
      const line = await SaleLine.findOneAndUpdate({ _id: saleLineId }, { $set: { updatedAt: new Date() } }, { new: true, session });
      if (!line || line.source === "OUTLET") throw new ReturnError("Select a main-branch sale item.");
      const sale = await Sale.findOne({ _id: line.saleId, isVoided: false, ownerOutletId: null, transactionType: { $ne: "INTERNAL_TRANSFER" }, fulfillmentStatus: { $ne: "PENDING" } }).session(session);
      if (!sale) throw new ReturnError("The original external customer sale is unavailable. Outlet returns belong in Outlet Operations.");
      if (line.stockUnit !== "QTY" && !Number.isInteger(quantity)) throw new ReturnError("Pieces, heads and packs require a whole quantity.");
      const priorReturns = await Return.find({ saleLineId, status: { $nin: ["CANCELLED", "REJECTED"] } }).session(session);
      let quote: ReturnType<typeof customerReturnQuote>;
      try { quote = customerReturnQuote(line.qty, priorReturns.reduce((sum, row) => sum + Number(row.quantity), 0), quantity, line.lineTotal, Number(line.baseQty || line.stockPcsOut || line.qty)); }
      catch (error) { throw new ReturnError(error instanceof Error ? error.message : "Invalid return quantity."); }
      const { baseQuantity, creditAmount } = quote;
      await Return.create([{ _id: id, saleId: sale._id, saleLineId, customerId: sale.customerId, receiptNumber: sale.receiptNumber, productName: line.productName, inventoryType: line.source === "CHICKEN" ? "BODEGA" : "GROCERY", quantity, unit: line.stockUnit || "QTY", baseQuantity, creditAmount, condition, reason, status: "PENDING_REVIEW", requestHash, createdBy: auth!.user.id }], { session });
      await AuditLog.create([{ module: "MAIN CUSTOMER RETURNS", action: "CREATE", entityType: "CUSTOMER_RETURN", entityId: id, newValue: { saleLineId, quantity, creditAmount, condition, status: "PENDING_REVIEW" }, remarks: reason, sourceChannel: "WEB", createdBy: auth!.user.id }], { session });
    });
    return NextResponse.json({ success: true, message: "Return request recorded for review. No stock, customer credit or cash refund has been posted." });
  } catch (error) {
    if (!(error instanceof ReturnError)) console.error("Main customer return failed", error);
    return NextResponse.json({ success: false, message: error instanceof ReturnError ? error.message : "Unable to record return. Refresh and check history before retrying." }, { status: error instanceof ReturnError ? 409 : 500 });
  } finally { await session.endSession(); }
}
