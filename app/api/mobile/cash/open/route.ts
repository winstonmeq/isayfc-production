// app/api/mobile/cash/open/route.ts
import { NextRequest, NextResponse } from "next/server";

import { requireMobileAuth } from "@/lib/mobile-auth";
import connectDb from "@/lib/mongodb";
import CashShiftModel from "@/models/CashShift";

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

  let body: { openingFloat?: number; remarks?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body." },
      { status: 400 }
    );
  }

  const openingFloat = Number(body?.openingFloat);
  if (!Number.isFinite(openingFloat) || openingFloat < 0) {
    return NextResponse.json(
      { success: false, message: "Enter a valid starting cash amount." },
      { status: 400 }
    );
  }

  // Block if this cashier already has an open shift.
  const existing = await CashShiftModel.findOne({
    cashierId: user.id,
    status: "OPEN",
  }).lean();

  if (existing) {
    return NextResponse.json(
      {
        success: false,
        message: "You already have an open shift. Close it before opening a new one.",
      },
      { status: 409 }
    );
  }

  let shift;
  try {
    shift = await CashShiftModel.create({
      outletId: user.outlet.id,
      cashierId: user.id,
      cashierName: user.name,
      status: "OPEN",
      openingFloat,
      openedAt: new Date(),
      openRemarks: String(body?.remarks || "").trim(),
    });
  } catch (error: any) {
    // The partial unique index on { cashierId, status: OPEN } rejects a second
    // concurrent open — surface it as the same friendly conflict as above.
    if (error?.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: "You already have an open shift. Close it before opening a new one.",
        },
        { status: 409 }
      );
    }
    throw error;
  }

  return NextResponse.json({
    success: true,
    message: "Shift opened.",
    shift: {
      id: shift._id.toString(),
      openingFloat: shift.openingFloat,
      openedAt: shift.openedAt.toISOString(),
    },
  });
}
