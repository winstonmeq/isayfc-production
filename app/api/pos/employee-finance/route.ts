import { createHash } from "node:crypto";
import { weightedCompanyCost } from "@/lib/company-cost";
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId, Types } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { outletExpenseDay, validIngredientQuantity } from "@/lib/business-flow";
import { addDays, manilaDateString } from "@/lib/date-utils";
import { moneyAmount, remainingAmount, outletCashSummary } from "@/lib/employee-finance";
import { OutletEmployee, OutletEmployeePurchase, OutletEmployeeCash } from "@/models/OutletEmployeeFinance";
import OutletInventory from "@/models/OutletInventory";
import OutletStockTransaction from "@/models/OutletStockTransaction";
import Sale from "@/models/Sale";
import Expense from "@/models/Expense";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { session, response } = await requirePermission("pos.view");
  if (response) return response;
  await dbConnect();
  const outletId = req.nextUrl.searchParams.get("outletId") || "";
  if (!isValidObjectId(outletId) || !await findAuthorizedPosOutlet(session!.user.id, outletId)) return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 403 });
  const day = outletExpenseDay(req.nextUrl.searchParams.get("date") ?? undefined);
  if (!day) return NextResponse.json({ success: false, message: "Invalid business date." }, { status: 400 });
  const dateRange = { $gte: day, $lt: addDays(day, 1) };
  const [employees, credits, purchases, movements, cashSales, expenses] = await Promise.all([
    OutletEmployee.find({ outletId, isActive: true }).sort({ name: 1 }).lean(),
    Sale.find({ outletId, source: "OUTLET", employeeId: { $ne: null }, isVoided: false, balance: { $gt: 0 } }).select("receiptNumber employeeId employeeName totalAmount paidAmount balance saleDate").sort({ saleDate: 1 }).lean(),
    OutletEmployeePurchase.find({ outletId }).sort({ purchaseDate: -1 }).lean(),
    OutletEmployeeCash.find({ outletId, businessDate: dateRange }).sort({ createdAt: -1 }).lean(),
    Sale.find({ outletId, source: "OUTLET", paymentMethod: "CASH", isVoided: false, saleDate: dateRange }).select("totalAmount").lean(),
    Expense.find({ outletId, expenseCategory: "OUTLET", isActive: true, expenseDate: dateRange }).select("amount").lean(),
  ]);
  const sum = (kind: string) => movements.filter((row) => row.kind === kind).reduce((total, row) => total + Number(row.amount), 0);
  return NextResponse.json({ success: true, employees, credits, purchases, movements,
    cash: outletCashSummary(cashSales.reduce((sum, row) => sum + row.totalAmount, 0), sum("EMPLOYEE_COLLECTION"), expenses.reduce((sum, row) => sum + row.amount, 0), sum("EMPLOYEE_REIMBURSEMENT")) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const action = String(body?.action || "");
  const { session, response } = await requirePermission(action === "COLLECT" || action === "REIMBURSE" ? "pos.employee-finance.manage" : "pos.manage");
  if (response) return response;
  await dbConnect();
  // Ensure collection/index creation completes before the first transaction.
  // Unique request keys are the database-level duplicate-submission guard.
  await Promise.all([OutletEmployee.init(), OutletEmployeePurchase.init(), OutletEmployeeCash.init()]);
  const outletId = String(body?.outletId || "");
  if (!isValidObjectId(outletId) || !await findAuthorizedPosOutlet(session!.user.id, outletId)) return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 403 });
  if (!["EMPLOYEE", "PURCHASE", "COLLECT", "REIMBURSE"].includes(action)) return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
  const mongoSession = await mongoose.startSession();
  try {
    if (action === "EMPLOYEE") {
      const name = String(body?.name || "").trim().toUpperCase();
      if (!name || name.length > 100) throw new Error("Enter an employee name (maximum 100 characters).");
      await OutletEmployee.create({ outletId, name, createdBy: session!.user.id });
      return NextResponse.json({ success: true, message: "Employee registered." });
    }
    const requestKey = String(body?.requestKey || "");
    if (!/^[\w-]{16,100}$/.test(requestKey)) throw new Error("A valid request key is required. Refresh and retry.");
    const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const amount = moneyAmount(body?.amount);
    const businessDate = outletExpenseDay(body?.date);
    if (!businessDate) throw new Error("Select a valid business date, not in the future.");
    const employeeId = String(body?.employeeId || "");
    if (!isValidObjectId(employeeId)) throw new Error("Select an employee.");
    await mongoSession.withTransaction(async () => {
      const model = action === "PURCHASE" ? OutletEmployeePurchase : OutletEmployeeCash;
      const existing = await model.findOne({ outletId, requestKey }).session(mongoSession);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new Error("This request key was already used for a different transaction.");
        return;
      }
      const employee = await OutletEmployee.findOne({ _id: employeeId, outletId, isActive: true }).session(mongoSession);
      if (!employee) throw new Error("Employee is not active at this outlet.");
      const common = { outletId, employeeId, employeeName: employee.name, amount, requestKey, requestHash, createdBy: session!.user.id, remarks: String(body?.remarks || "").slice(0, 500) };
      if (action === "PURCHASE") {
        const supplier = String(body?.supplier || "").trim().slice(0, 150);
        const receipt = String(body?.receipt || "").trim().slice(0, 150);
        if (!supplier || !receipt) throw new Error("Supplier and receipt/reference are required.");
        let inventory;
        if (body?.inventoryId) {
          if (!isValidObjectId(body.inventoryId)) throw new Error("Invalid stock item.");
          inventory = await OutletInventory.findOne({ _id: body.inventoryId, outletId, isActive: true }).session(mongoSession);
          if (!inventory) throw new Error("Stock item does not belong to this outlet.");
        } else {
          const name = String(body?.productName || "").trim().toUpperCase();
          const unit = String(body?.unit || "").toUpperCase() as "QTY" | "KG" | "PCS" | "HEAD";
          if (!name || name.length > 100 || !["QTY", "KG", "PCS", "HEAD"].includes(unit)) throw new Error("Enter a product name and base unit.");
          [inventory] = await OutletInventory.create([{ outletId, productSource: "GROCERY", originType: "OUTSIDE_PURCHASE", productId: new Types.ObjectId(), productName: name, categoryName: "OUTSIDE PURCHASE", stockQty: 0, unitLabel: unit, packSize: 0, buyingPrice: 0, sellingPrice: 0, createdBy: session!.user.id }], { session: mongoSession });
        }
        const quantity = Number(body?.quantity);
        const quantityUnit = Number(inventory.packSize) > 0 ? "PCS" : inventory.unitLabel;
        if (!validIngredientQuantity(quantity, quantityUnit)) throw new Error("Enter a positive base quantity; heads and pieces must be whole.");
        const before = Number(inventory.stockQty);
        inventory.companyUnitCost = weightedCompanyCost(before, inventory.companyUnitCost, quantity, amount / quantity);
        if (before < 0) throw new Error("Resolve negative stock with a stock count before receiving an outside purchase.");
        const pack = Number(inventory.packSize) > 0 ? Number(inventory.packSize) : 1;
        inventory.buyingPrice = ((before * Number(inventory.buyingPrice) / pack + amount) / (before + quantity)) * pack;
        inventory.stockQty = before + quantity;
        await inventory.save({ session: mongoSession });
        const [purchase] = await OutletEmployeePurchase.create([{ ...common, inventoryId: inventory._id, productName: inventory.productName, quantity, unit: quantityUnit, purchaseDate: businessDate, supplier, receipt }], { session: mongoSession });
        await OutletStockTransaction.create([{ outletId, outletInventoryId: inventory._id, productSource: inventory.productSource, productId: inventory.productId, productName: inventory.productName, transactionDate: businessDate, type: "STOCK_IN", quantity, unitCost: amount / quantity, entryUnit: quantityUnit, entryQty: quantity, multiplier: 1, baseUnit: quantityUnit === "HEAD" ? "HEAD" : quantityUnit === "PCS" ? "PCS" : quantityUnit === "KG" ? "KG" : "QTY", previousStock: before, newStock: inventory.stockQty, referenceType: "EMPLOYEE_OUTSIDE_PURCHASE", referenceId: purchase._id, sourceChannel: "WEB", remarks: `${employee.name} | ${supplier} | ${receipt}`, createdBy: session!.user.id }], { session: mongoSession });
      } else {
        const referenceId = String(body?.referenceId || "");
        if (!isValidObjectId(referenceId)) throw new Error("Select an outstanding transaction.");
        if (action === "COLLECT") {
          const sale = await Sale.findOne({ _id: referenceId, outletId, source: "OUTLET", employeeId, paymentMethod: "CREDIT", isVoided: false }).session(mongoSession);
          if (!sale) throw new Error("Employee credit sale was not found.");
          if (businessDate < outletExpenseDay(manilaDateString(sale.saleDate))!) throw new Error("Collection cannot predate the sale.");
          sale.balance = remainingAmount(sale.totalAmount, sale.paidAmount, amount);
          sale.paidAmount = Math.round((sale.paidAmount + amount) * 100) / 100;
          sale.status = sale.balance === 0 ? "PAID" : "PARTIAL";
          await sale.save({ session: mongoSession });
        } else {
          const purchase = await OutletEmployeePurchase.findOne({ _id: referenceId, outletId, employeeId }).session(mongoSession);
          if (!purchase) throw new Error("Employee purchase was not found.");
          if (businessDate < purchase.purchaseDate) throw new Error("Reimbursement cannot predate the purchase.");
          remainingAmount(purchase.amount, purchase.reimbursed, amount);
          purchase.reimbursed = Math.round((purchase.reimbursed + amount) * 100) / 100;
          await purchase.save({ session: mongoSession });
        }
        await OutletEmployeeCash.create([{ ...common, kind: action === "COLLECT" ? "EMPLOYEE_COLLECTION" : "EMPLOYEE_REIMBURSEMENT", referenceId, businessDate }], { session: mongoSession });
      }
    });
    return NextResponse.json({ success: true, message: "Employee transaction recorded. Sales and expenses were not duplicated." });
  } catch (error) {
    const duplicate = (error as { code?: number }).code === 11000;
    return NextResponse.json({ success: false, message: duplicate ? "Employee name or transaction already exists. Reload to verify before retrying." : error instanceof Error ? error.message : "Unable to save employee transaction." }, { status: 409 });
  } finally { await mongoSession.endSession(); }
}
