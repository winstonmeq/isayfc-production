import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { returnSettlement } from "@/lib/main-return-settlement";
import Return from "@/models/MainCustomerReturn";
import Sale from "@/models/Sale";
import SaleLine from "@/models/SaleLine";
import Bodega from "@/models/BodegaProduct";
import Product from "@/models/Product";
import BodegaLedger from "@/models/BodegaStockTransaction";
import GroceryLedger from "@/models/InventoryTransaction";
import Audit from "@/models/AuditLog";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("inventory-adjustments.manage");
  if (access.response) return access.response;
  const finance = await requirePermission("payments.manage");
  if (finance.response) return finance.response;
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const reason = String(body?.reason || "").trim();
  const refundReference = String(body?.refundReference || "").trim();
  if (!mongoose.isValidObjectId(id) || reason.length < 5 || reason.length > 1000 || !body?.expectedUpdatedAt || !Number.isFinite(new Date(body.expectedUpdatedAt).getTime())) return NextResponse.json({ success: false, message: "A valid return version and posting reason are required." }, { status: 400 });
  await dbConnect();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const row = await Return.findById(id).session(session);
      if (!row) throw new Error("Return not found.");
      if (row.status === "POSTED") return; // Retrying a committed posting is harmless.
      if (row.status !== "APPROVED_AWAITING_POSTING" || row.updatedAt.getTime() !== new Date(body.expectedUpdatedAt).getTime()) throw new Error("Return changed or is not approved. Reopen the review.");
      const sale = await Sale.findOne({ _id: row.saleId, isVoided: false, ownerOutletId: null, source: { $in: ["CHICKEN", "BODEGA", "MIXED"] }, transactionType: { $ne: "INTERNAL_TRANSFER" }, fulfillmentStatus: { $ne: "PENDING" } }).session(session);
      const line = await SaleLine.findOne({ _id: row.saleLineId, saleId: row.saleId }).session(session);
      if (!sale || !line) throw new Error("Original external sale is unavailable.");
      const posted = await Return.find({ saleLineId: line._id, status: "POSTED" }).session(session);
      const priorQty = posted.reduce((n, r) => n + Number(r.quantity), 0);
      if (!(row.quantity > 0) || priorQty + row.quantity > line.qty + 0.000001) throw new Error("Return exceeds remaining sold quantity.");
      const base = Number(line.baseQty ?? line.stockPcsOut ?? line.qty);
      const expectedBase = base * row.quantity / line.qty;
      const expectedCredit = Math.round(line.lineTotal * row.quantity / line.qty * 100) / 100;
      if (!Number.isFinite(expectedBase) || expectedBase <= 0 || Math.abs(expectedBase - row.baseQuantity) > 0.000001 || Math.abs(expectedCredit - row.creditAmount) > 0.011) throw new Error("Original sale changed since intake. Review a new return request.");
      // Final fractional return absorbs the original line's rounding remainder.
      const amount = Math.round((Math.abs(priorQty + row.quantity - line.qty) < 0.000001 ? line.lineTotal - posted.reduce((n, r) => n + Number(r.creditAmount), 0) : expectedCredit) * 100) / 100;
      const settlement = returnSettlement(sale, amount);
      if (Math.round(Number(body.expectedRefund) * 100) !== Math.round(settlement.refund * 100) || Math.round(Number(body.expectedCredit) * 100) !== Math.round(settlement.credit * 100) || !Number.isFinite(body.expectedRefund) || !Number.isFinite(body.expectedCredit)) throw new Error("Settlement changed. Reopen the return and confirm the current credit/refund amounts.");
      if (settlement.refund > 0 && (body.confirmRefund !== true || refundReference.length < 3 || refundReference.length > 200)) throw new Error("Confirm the actual cash refund and enter its reference before posting.");
      if (row.condition === "RESTOCKABLE" && body.confirmRestock !== true) throw new Error("Confirm the returned goods were inspected and are sellable.");
      const now = new Date();
      const restock = row.condition === "RESTOCKABLE";
      const isBodega = line.source === "CHICKEN";
      if ((isBodega ? "BODEGA" : "GROCERY") !== row.inventoryType || !["CHICKEN", "BODEGA"].includes(line.source)) throw new Error("Return inventory source is invalid.");
      if (restock) {
        const product = isBodega ? await Bodega.findById(line.bodegaProductId).session(session) : await Product.findById(line.productId).session(session);
        if (!product || !product.isActive) throw new Error("Original inventory item is missing or inactive.");
        const before = Number(isBodega ? product.get("stockQty") : product.get("stockPcs"));
        if (!Number.isFinite(before)) throw new Error("Inventory balance is invalid.");
        product.set(isBodega ? "stockQty" : "stockPcs", before + expectedBase);
        if (isBodega && line.stockUnit === "HEAD") product.set("stockHeads", Number(product.get("stockHeads") || 0) + expectedBase);
        const restoredKilos = line.baseUnit === "KG" ? expectedBase : line.stockUnit === "HEAD" && line.kilosOut != null ? Number(line.kilosOut) * expectedBase / Number(line.baseQty || line.qty) : undefined;
        if (isBodega && restoredKilos != null) product.set("stockKilos", Number(product.get("stockKilos") || 0) + restoredKilos);
        await product.save({ session });
        const common = { transactionDate: now, type: "STOCK_IN" as const, quantity: expectedBase, previousStock: before, newStock: before + expectedBase, referenceType: "CUSTOMER_RETURN", referenceId: row._id, remarks: `RETURN ${sale.receiptNumber}: ${reason}`, createdBy: access.session!.user.id };
        if (isBodega) await BodegaLedger.create([{ ...common, bodegaProductId: product._id, heads: line.stockUnit === "HEAD" ? expectedBase : 0, pieces: line.stockUnit === "HEAD" || line.baseUnit === "KG" ? 0 : expectedBase, kilos: restoredKilos || 0, kilosDelta: restoredKilos }], { session });
        else await GroceryLedger.create([{ ...common, productId: product._id, unit: "PCS" }], { session });
      }
      sale.returnedAmount = Math.round((Number(sale.returnedAmount || 0) + amount) * 100) / 100;
      sale.refundedAmount = Math.round((Number(sale.refundedAmount || 0) + settlement.refund) * 100) / 100;
      sale.balance = settlement.balance;
      sale.status = sale.balance <= 0 ? "PAID" : sale.paidAmount > 0 ? "PARTIAL" : "UNPAID";
      await sale.save({ session }); // Serializes against collections and other return postings.
      row.set({ status: "POSTED", postedAt: now, postedBy: access.session!.user.id, postingReason: reason, creditAmount: amount, balanceCredit: settlement.credit, cashRefund: settlement.refund, refundReference: settlement.refund ? refundReference : "", restocked: restock, restoredCost: restock ? Math.round(expectedBase * line.unitCost * 100) / 100 : 0, unitCost: line.unitCost, source: line.source, categoryName: line.categoryName });
      await row.save({ session });
      await Audit.create([{ module: "MAIN CUSTOMER RETURNS", action: "POST", entityType: "CUSTOMER_RETURN", entityId: row._id, newValue: { amount, ...settlement, restocked: restock, baseQuantity: expectedBase, refundReference }, remarks: reason, createdBy: access.session!.user.id, sourceChannel: "WEB" }], { session });
    });
    return NextResponse.json({ success: true, message: "Return posted. Inventory and customer settlement are updated; any confirmed cash refund is recorded." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to post return." }, { status: 409 });
  } finally { await session.endSession(); }
}
