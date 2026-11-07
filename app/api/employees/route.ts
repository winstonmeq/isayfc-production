import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { validEmployeeCode } from "@/lib/employee-credit-policy";
import { withAuditLog } from "@/lib/audit-log";
import Employee from "@/models/Employee";
import Customer from "@/models/Customer";

export async function GET(req: NextRequest) {
  const { session, response } = await requirePermission(["payments.view", "sales.manage", "pos.manage"]);
  if (response) return response;
  const user = session!.user;
  if (user.role !== "ADMIN" && !user.permissions?.some(p => ["payments.view", "sales.manage"].includes(p))) {
    if (!await findAuthorizedPosOutlet(user.id, req.nextUrl.searchParams.get("outletId") || "")) return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 403 });
  }
  await dbConnect();
  const employees = await Employee.find({ isActive: true }).select("code name customerId").sort({ name: 1 }).lean();
  return NextResponse.json({ success: true, employees });
}

async function handlePOST(req: NextRequest) {
  const { session, response } = await requirePermission("payments.manage");
  if (response) return response;
  const body = await req.json().catch(() => null);
  const code = String(body?.code || "").trim().toUpperCase();
  const name = String(body?.name || "").trim().toUpperCase();
  if (!validEmployeeCode(code) || name.length < 2 || name.length > 100) return NextResponse.json({ success: false, message: "Enter an employee code (2–30 letters/numbers) and name." }, { status: 400 });
  await dbConnect();
  await Employee.init();
  const transaction = await mongoose.startSession();
  try {
    await transaction.withTransaction(async () => {
      const [customer] = await Customer.create([{ name: `EMPLOYEE ${code} — ${name}`, type: "SALE", createdBy: session!.user.id }], { session: transaction });
      await Employee.create([{ code, name, customerId: customer._id, createdBy: session!.user.id }], { session: transaction });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: (error as { code?: number }).code === 11000 ? "Employee code already exists." : "Unable to register employee." }, { status: 409 });
  } finally { await transaction.endSession(); }
}

export const POST = withAuditLog(handlePOST, { module: "EMPLOYEES", action: "CREATE", entityType: "EMPLOYEE" });
