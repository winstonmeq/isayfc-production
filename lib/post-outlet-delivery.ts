import { type ClientSession } from "mongoose";
import Sale from "@/models/Sale";
import SaleLine from "@/models/SaleLine";
import StockTransfer from "@/models/StockTransfer";
import StockTransferItem from "@/models/StockTransferItem";
import Customer from "@/models/Customer";
import { packingSnapshot, toBaseUnitCost } from "@/lib/inventory-units";
import { roundMoney } from "@/lib/report-utils";
import { getSaleOrigin } from "@/lib/sale-origin";
import { ownerOutletSettlement } from "@/lib/main-payment-policy";
import { ownerDeliverySaleTotals } from "./outlet-delivery-expense-policy";

export class OutletDeliveryPostingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Caller must include this in the SAME transaction as receipt and stock changes. */
export async function postOutletDelivery(transferId: string, session: ClientSession, userId?: string, allowRecognized = false) {
  const transfer = await StockTransfer.findOne({ _id: transferId, status: "CONFIRMED" }).session(session);
  if (!transfer) throw new OutletDeliveryPostingError(409, "Only a confirmed outlet delivery can be posted.");
  let sale = transfer.saleId ? await Sale.findById(transfer.saleId).session(session) : null;
  const date = transfer.confirmedAt || transfer.deliveredAt || new Date();
  if (!transfer.saleId) {
    // Administrator manual deliveries must also become regular customer sales.
    const customer = await Customer.findOne({ outletId: transfer.outletId, isActive: true }).session(session);
    if (!customer) throw new OutletDeliveryPostingError(409, "This outlet needs an active linked customer before its delivery can be received.");
    const items = await StockTransferItem.find({ transferId: transfer._id }).session(session).lean();
    const lines = items.filter((item) => item.receivedQty > 0).map((item) => {
      const multiplier = item.unitLabel === "PACK" ? Number(item.packSize || 1) : 1;
      const baseQty = Number(item.receivedPcs ?? item.receivedQty * multiplier);
      const baseUnit = item.baseUnit || (item.unitLabel === "HEAD" ? "HEAD" : item.source === "GROCERY" ? "QTY" : "PCS");
      return { source: item.source === "BODEGA" ? "CHICKEN" as const : "BODEGA" as const, productId: item.productId, bodegaProductId: item.bodegaProductId,
        productName: item.productName, categoryName: item.categoryName || item.source, qty: item.receivedQty,
        stockUnit: item.unitLabel === "PACK" ? "PACK" : item.unitLabel === "HEAD" ? "HEAD" : "QTY", packSize: item.packSize,
        stockPcsOut: baseQty, baseQty, baseUnit, multiplier, price: Number(item.sellingPrice),
        lineTotal: roundMoney(item.receivedQty * Number(item.sellingPrice)),
        unitCost: item.companyUnitCost ?? toBaseUnitCost(item.buyingPrice, packingSnapshot({ unit: item.unitLabel, baseUnit, multiplier })),
        remarks: `RECEIVED DELIVERY ${transfer.transferNumber}` };
    });
    if (!lines.length) return null;
    const totals = ownerDeliverySaleTotals(lines);
    [sale] = await Sale.create([{ receiptNumber: transfer.transferNumber, customerId: customer._id,
      ownerOutletId: transfer.outletId, transactionType: "EXTERNAL_SALE", stockTransferId: transfer._id,
      source: new Set(lines.map((line) => line.source)).size > 1 ? "MIXED" : lines[0].source,
      saleDate: transfer.transferDate, recognizedAt: date, fulfillmentStatus: "PENDING", status: "PENDING", paidAmount: 0, balance: 0,
      totalAmount: roundMoney(totals.reduce((sum, row) => sum + row.amount, 0)),
      totalQty: lines.reduce((sum, line) => sum + line.qty, 0), totalPacks: lines.filter((line) => line.stockUnit === "PACK").reduce((sum, line) => sum + line.qty, 0),
      createdBy: userId, isVoided: false, remarks: `OUTLET DELIVERY ${transfer.transferNumber}` }], { session });
    await SaleLine.insertMany(lines.map((line) => ({ ...line, saleId: sale!._id })), { session });
    transfer.saleId = sale!._id; await transfer.save({ session });
  }
  if (!sale || sale.isVoided || getSaleOrigin(sale) === "OUTLET") throw new OutletDeliveryPostingError(409, "The linked main sale is unavailable or voided. No receipt changes were posted.");
  if (!allowRecognized && sale.fulfillmentStatus !== "PENDING") throw new OutletDeliveryPostingError(409, "The linked sale was already recognized. Refresh the delivery.");
  const lines = await SaleLine.find({ saleId: sale._id }).session(session).lean();
  const totals = ownerDeliverySaleTotals(lines);
  if (roundMoney(totals.reduce((sum, row) => sum + row.amount, 0)) !== roundMoney(sale.totalAmount)) throw new OutletDeliveryPostingError(409, "Sale lines do not match the invoice total. Correct the sale before receiving.");
  sale.transactionType = "EXTERNAL_SALE"; sale.ownerOutletId = transfer.outletId;
  sale.fulfillmentStatus = "RECOGNIZED"; sale.recognizedAt ||= date;
  if (sale.paidAmount > 0) throw new OutletDeliveryPostingError(409, "This owner-outlet sale has an existing payment. Review it before changing settlement.");
  Object.assign(sale, ownerOutletSettlement());
  await sale.save({ session });
  // Receipt adds outlet inventory in the caller. It is not an operating expense.
  return sale;
}
