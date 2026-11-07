import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: false, message: "Employee accounts module has been removed." }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ success: false, message: "Employee accounts module has been removed." }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ success: false, message: "Employee accounts module has been removed." }, { status: 410 });
}
