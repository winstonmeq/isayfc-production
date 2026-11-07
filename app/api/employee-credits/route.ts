import { createHash } from "crypto";
import mongoose, { isValidObjectId } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { employeeCreditAmounts, validCreditDate } from "@/lib/employee-credit-policy";
import { manilaDateString } from "@/lib/date-utils";
import { moneyAmount } from "@/lib/employee-finance";
import { getPagination, escapeRegex } from "@/lib/crud-utils";
import { withAuditLog } from "@/lib/audit-log";
import { getSaleOrigin } from "@/lib/sale-origin";
import Employee from "@/models/Employee";
import Sale from "@/models/Sale";
import SaleLine from "@/models/SaleLine";
import Payment from "@/models/Payment";
import PaymentAllocation from "@/models/PaymentAllocation";
import { OutletEmployeeCash } from "@/models/OutletEmployeeFinance";
import Outlet from "@/models/Outlet";

const creditFields = {
  credit: { $round: [{ $max: [0, { $subtract: ["$totalAmount", { $ifNull: ["$returnedAmount", 0] }] }] }, 2] },
  balance: { $round: [{ $max: [0, { $add: [{ $subtract: [{ $subtract: ["$totalAmount", { $ifNull: ["$returnedAmount", 0] }] }, { $ifNull: ["$paidAmount", 0] }] }, { $ifNull: ["$refundedAmount", 0] }] }] }, 2] },
};

async function employeeSaleFilter(): Promise<Record<string, any>> {
  const employees = await Employee.find({}).select("customerId").lean<any[]>();
  return { isVoided: { $ne: true }, status: { $nin: ["VOIDED", "INTERNAL"] }, ownerOutletId: null, transactionType: { $ne: "INTERNAL_TRANSFER" }, fulfillmentStatus: { $ne: "PENDING" },
    $or: [{ employeeAccountId: { $type: "objectId" } }, { employeeId: { $type: "objectId" } }, { customerId: { $in: employees.map(e => e.customerId) } }] };
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("payments.view");
  if (response) return response;
  await dbConnect(); void Outlet;
  const params = req.nextUrl.searchParams;
  const filter: any = await employeeSaleFilter();
  const saleId = params.get("saleId");
  if (saleId) {
    if (!isValidObjectId(saleId)) return NextResponse.json({ success: false, message: "Invalid sale." }, { status: 400 });
    const sale = await Sale.findOne({ ...filter, _id: saleId }).lean();
    if (!sale) return NextResponse.json({ success: false, message: "Employee sale not found." }, { status: 404 });
    const [items, allocations, collections] = await Promise.all([
      SaleLine.find({ saleId }).select("productName qty price lineTotal stockUnit unitCode").lean(),
      PaymentAllocation.find({ saleId }).populate("paymentId", "paymentDate amount referenceNumber isVoided").lean(),
      OutletEmployeeCash.find({ referenceId: saleId, kind: "EMPLOYEE_COLLECTION" }).select("businessDate amount receivedAt remarks").lean(),
    ]);
    return NextResponse.json({ success: true, sale, items, allocations, collections });
  }
  const search = (params.get("employee") || "").trim();
  if (search) {
    const employees = await Employee.find({ $or: [{ name: new RegExp(escapeRegex(search), "i") }, { code: new RegExp(escapeRegex(search), "i") }] }).select("customerId").lean<any[]>();
    filter.$and = [{ $or: [{ employeeName: new RegExp(escapeRegex(search), "i") }, { employeeAccountId: { $in: employees.map(e => e._id) } }, { customerId: { $in: employees.map(e => e.customerId) } }] }];
  }
  const source = params.get("source");
  if (source === "OUTLET") filter.source = "OUTLET";
  if (source === "MAIN") filter.source = { $ne: "OUTLET" };
  const from = params.get("dateFrom"), to = params.get("dateTo");
  if ((from && !validCreditDate(from, "9999-12-31")) || (to && !validCreditDate(to, "9999-12-31")) || (from && to && from > to)) return NextResponse.json({ success: false, message: "Select a valid date range." }, { status: 400 });
  if (from || to) filter.saleDate = { ...(from ? { $gte: new Date(`${from}T00:00:00+08:00`) } : {}), ...(to ? { $lt: new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000) } : {}) };
  const { page, limit, skip } = getPagination(params);
  if (!Number.isSafeInteger(page) || page < 1) return NextResponse.json({ success: false, message: "Invalid page." }, { status: 400 });
  const stages: any[] = [{ $match: filter }, { $set: creditFields }, { $set: { paid: { $round: [{ $max: [0, { $subtract: ["$credit", "$balance"] }] }, 2] } } }];
  if (params.get("status") === "UNPAID") stages.push({ $match: { balance: { $gt: 0 } } });
  if (params.get("status") === "PAID") stages.push({ $match: { balance: 0 } });
  const [result] = await Sale.aggregate([...stages, { $facet: {
    rows: [{ $sort: { saleDate: -1, _id: -1 } }, { $skip: skip }, { $limit: limit }, { $lookup: { from: "employees", let: { account: "$employeeAccountId", customer: "$customerId" }, pipeline: [{ $match: { $expr: { $or: [{ $eq: ["$_id", "$$account"] }, { $eq: ["$customerId", "$$customer"] }] } } }, { $project: { name: 1, code: 1 } }], as: "employee" } }, { $lookup: { from: "outlets", localField: "outletId", foreignField: "_id", as: "outlet" } }, { $project: { saleDate: 1, receiptNumber: 1, employeeName: 1, source: 1, credit: 1, paid: 1, balance: 1, "employee.name": 1, "employee.code": 1, "outlet.name": 1 } }],
    totals: [{ $group: { _id: null, count: { $sum: 1 }, credit: { $sum: "$credit" }, paid: { $sum: "$paid" }, balance: { $sum: "$balance" } } }],
  } }]);
  return NextResponse.json({ success: true, rows: result.rows, totals: result.totals[0] || { count: 0, credit: 0, paid: 0, balance: 0 }, page, limit });
}

class CreditError extends Error { constructor(public status: number, message: string) { super(message); } }

async function handlePOST(req: NextRequest) {
  const { session, response } = await requirePermission("payments.manage");
  if (response) return response;
  const body = await req.json().catch(() => null);
  const saleId = String(body?.saleId || ""), date = String(body?.date || ""), requestKey = String(body?.requestKey || "");
  if (!isValidObjectId(saleId) || !/^[\w-]{16,80}$/.test(requestKey) || !validCreditDate(date, manilaDateString())) return NextResponse.json({ success: false, message: "Enter a valid sale, collection date and request key." }, { status: 400 });
  let amount: number;
  try { amount = moneyAmount(body?.amount); } catch { return NextResponse.json({ success: false, message: "Enter a positive amount with at most two decimals." }, { status: 400 }); }
  const reference = String(body?.reference || "").trim().slice(0, 100), remarks = String(body?.remarks || "").trim().slice(0, 250);
  if (date < manilaDateString() && remarks.length < 5) return NextResponse.json({ success: false, message: "Enter a reason for the backdated collection." }, { status: 400 });
  const hash = createHash("sha256").update(JSON.stringify({ saleId, date, amount, reference, remarks })).digest("hex");
  const id = new mongoose.Types.ObjectId(createHash("sha256").update(`employee-credit:${session!.user.id}:${requestKey}`).digest("hex").slice(0, 24));
  await dbConnect();
  const filter = await employeeSaleFilter();
  const transaction = await mongoose.startSession();
  try {
    await transaction.withTransaction(async () => {
      const existingPayment = await Payment.findById(id).session(transaction);
      const existingCash = await OutletEmployeeCash.findById(id).session(transaction).lean<any>();
      if (existingPayment || existingCash) {
        if ((existingPayment?.employeeCollectionHash || existingCash?.requestHash) !== hash) throw new CreditError(409, "Request already used for another collection.");
        return;
      }
      const sale = await Sale.findOne({ ...filter, _id: saleId }).session(transaction);
      if (!sale || sale.ownerOutletId) throw new CreditError(404, "Collectible employee sale not found.");
      const { balance } = employeeCreditAmounts(sale);
      if (amount > balance) throw new CreditError(400, `Collection exceeds balance of ${balance.toFixed(2)}.`);
      if (getSaleOrigin(sale) === "OUTLET") {
        if (!sale.outletId || (!sale.employeeAccountId && !sale.employeeId)) throw new CreditError(400, "Employee or outlet link is missing.");
        await OutletEmployeeCash.create([{ _id: id, outletId: sale.outletId, employeeId: sale.employeeAccountId || sale.employeeId, employeeName: sale.employeeName || "EMPLOYEE", kind: "EMPLOYEE_COLLECTION", receivedAt: "MAIN", referenceId: sale._id, amount, businessDate: new Date(date), requestKey, requestHash: hash, remarks: `${reference} ${remarks}`.trim(), createdBy: session!.user.id }], { session: transaction });
      } else {
        if (!sale.customerId) throw new CreditError(400, "Original customer link is missing.");
        await Payment.create([{ _id: id, customerId: sale.customerId, paymentDate: new Date(date), amount, appliedAmount: amount, unappliedAmount: 0, referenceNumber: reference, remarks: `EMPLOYEE COLLECTION AT MAIN ${remarks}`, employeeCollectionHash: hash, createdBy: session!.user.id }], { session: transaction });
        await PaymentAllocation.create([{ paymentId: id, saleId: sale._id, amount }], { session: transaction });
      }
      sale.paidAmount = Math.round((Number(sale.paidAmount || 0) + amount) * 100) / 100;
      sale.balance = Math.round((balance - amount) * 100) / 100;
      sale.status = sale.balance === 0 ? "PAID" : "PARTIAL";
      await sale.save({ session: transaction });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof CreditError ? error.message : "Unable to collect credit. Refresh the balance and try again." }, { status: error instanceof CreditError ? error.status : 500 });
  } finally { await transaction.endSession(); }
}

export const POST = withAuditLog(handlePOST, { module: "EMPLOYEE_CREDITS", action: "COLLECT", entityType: "SALE" });
