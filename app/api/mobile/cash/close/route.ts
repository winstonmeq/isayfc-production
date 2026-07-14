// app/api/mobile/cash/close/route.ts
import { NextRequest, NextResponse } from "next/server";

import { requireMobileAuth } from "@/lib/mobile-auth";
import connectDb from "@/lib/mongodb";
import CashShiftModel from "@/models/CashShift";
import { sumShiftSales, sumShiftExpenses } from "@/lib/cash-shift";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, "cash.manage");
  if (response) return response;

  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  await connectDb();

  let body: { countedCash?: number; remarks?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body." },
      { status: 400 }
    );
  }

  const countedCash = Number(body?.countedCash);
  if (!Number.isFinite(countedCash) || countedCash < 0) {
    return NextResponse.json(
      { success: false, message: "Enter the counted cash amount." },
      { status: 400 }
    );
  }

  // Match by cashier only — the same scope as the open-shift check and the
  // partial unique index. Filtering by the cashier's CURRENT outlet would
  // deadlock a cashier who was reassigned while holding an open shift: close
  // would 404 (outlet mismatch) while open would 409 (shift still open). The
  // shift document carries its own outletId for reporting.
  const shift = await CashShiftModel.findOne({
    cashierId: user.id,
    status: "OPEN",
  });

  if (!shift) {
    return NextResponse.json(
      { success: false, message: "You have no open shift to close." },
      { status: 404 }
    );
  }

  const { total: cashSales, count: salesCount } = await sumShiftSales(
    shift._id.toString()
  );

  const { total: cashExpenses } = await sumShiftExpenses(shift._id.toString());
  const expectedCash =
    Number(shift.openingFloat || 0) + cashSales - cashExpenses;
  const variance = countedCash - expectedCash;

  shift.status = "CLOSED";
  shift.cashSales = cashSales;
  shift.cashExpenses = cashExpenses;
  shift.salesCount = salesCount;
  shift.expectedCash = expectedCash;
  shift.countedCash = countedCash;
  shift.variance = variance;
  shift.closedAt = new Date();
  shift.closeRemarks = String(body?.remarks || "").trim();

  await shift.save();

  return NextResponse.json({
    success: true,
    message: "Shift closed.",
    summary: {
      openingFloat: Number(shift.openingFloat || 0),
      cashSales,
      cashExpenses,
      salesCount,
      expectedCash,
      countedCash,
      variance, // positive = over, negative = short
      openedAt: shift.openedAt ? new Date(shift.openedAt).toISOString() : null,
      closedAt: shift.closedAt.toISOString(),
    },
  });
}
