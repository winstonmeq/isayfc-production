import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";
import CustomerModel from "@/models/Customer";
import { recognizedSaleRange } from "@/lib/business-flow";
import { roundMoney } from "@/lib/report-utils";

/** Overall elimination reference only; no additional main deduction. */
export async function getOwnerOutletAllocations(start: Date, end: Date, source?: string | null) {
  void CustomerModel;
  const orders = await SaleModel.find({ ownerOutletId: { $exists: true, $ne: null }, isVoided: false,
    fulfillmentStatus: "RECOGNIZED", $expr: recognizedSaleRange(start, end) })
    .populate("customerId", "name").sort({ recognizedAt: 1, _id: 1 }).lean();
  const selectedSource = source === "CHICKEN" || source === "BODEGA" ? source : undefined;
  const lines = orders.length ? await SaleLineModel.find({ saleId: { $in: orders.map((order) => order._id) }, ...(selectedSource ? { source: selectedSource } : {}) }).lean() : [];
  const rows = orders.filter((order) => !selectedSource || lines.some((line) => String(line.saleId) === String(order._id))).map((order) => {
    const items = lines.filter((line) => String(line.saleId) === String(order._id));
    const missingCostLines = items.length ? items.filter(item => item.unitCost == null || !Number.isFinite(item.unitCost) || item.unitCost < 0 || !Number.isFinite(Number(item.baseQty ?? item.stockPcsOut ?? item.qty))).length : 1;
    const actualCost = roundMoney(items.reduce((sum, item) => sum + Number(item.unitCost || 0) * Number(item.baseQty ?? item.stockPcsOut ?? item.qty ?? 0), 0));
    const customer = order.customerId as unknown as { name?: string } | null;
    return { id: String(order._id), receiptNumber: order.receiptNumber, date: order.recognizedAt || order.saleDate,
      outlet: customer?.name || "Owner-owned outlet", products: items.map((item) => `${item.productName}: ${item.qty} ${item.stockUnit || "QTY"}`).join(", "),
      quantity: items.reduce((total, item) => total + Number(item.baseQty ?? item.stockPcsOut ?? item.qty ?? 0), 0),
      transferValue: roundMoney(selectedSource ? items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0) : Number(order.totalAmount || 0)),
      outstandingBalance: selectedSource ? undefined : roundMoney(Math.max(Number(order.balance ?? (Number(order.totalAmount || 0) - Number(order.paidAmount || 0))), 0)),
      actualCost, missingCostLines };
  });
  return { rows, count: rows.length, actualCost: roundMoney(rows.reduce((sum, row) => sum + row.actualCost, 0)),
    transferValue: roundMoney(rows.reduce((sum, row) => sum + row.transferValue, 0)),
    outstandingBalance: selectedSource ? undefined : roundMoney(rows.reduce((sum, row) => sum + Number(row.outstandingBalance || 0), 0)),
    missingCostLines: rows.reduce((sum, row) => sum + row.missingCostLines, 0) };
}
