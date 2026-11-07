import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import LoginHistory from "@/models/LoginHistory";
import { escapeRegex } from "@/lib/crud-utils";
import { validCreditDate } from "@/lib/employee-credit-policy";
import { manilaDateString } from "@/lib/date-utils";
import { loginActivityStatus } from "@/lib/login-history-policy";
import { recordSystemError } from "@/lib/system-error";

export async function GET(req: NextRequest) {
  try {
  const { response } = await requirePermission("admin.login-history");
  if (response) return response;
  const params = req.nextUrl.searchParams;
  const from = params.get("from") || "", to = params.get("to") || "";
  const today = manilaDateString();
  const status = params.get("status") || "ALL";
  if ((from && !validCreditDate(from, today)) || (to && !validCreditDate(to, today)) || (from && to && from > to) || !["ALL", "SUCCESS", "FAILED"].includes(status)) return NextResponse.json({ success: false, message: "Select valid dates and status." }, { status: 400 });
  const limit = [25, 50, 100].includes(Number(params.get("limit"))) ? Number(params.get("limit")) : 25;
  const requested = Number(params.get("page") || 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const query = (params.get("search") || "").trim().slice(0, 160);
  const filter: { userName?: RegExp; status?: "SUCCESS" | "FAILED"; loginAt?: { $gte?: Date; $lt?: Date } } = {};
  if (query) filter.userName = new RegExp(escapeRegex(query), "i");
  if (status === "SUCCESS" || status === "FAILED") filter.status = status;
  if (from || to) filter.loginAt = { ...(from ? { $gte: new Date(`${from}T00:00:00+08:00`) } : {}), ...(to ? { $lt: new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000) } : {}) };
  const total = await LoginHistory.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const rows = await LoginHistory.find(filter).sort({ loginAt: -1, _id: -1 }).skip((currentPage - 1) * limit).limit(limit).lean();
  return NextResponse.json({ success: true, rows: rows.map(row => ({ id: String(row._id), userName: row.userName, roleName: row.roleName, status: row.status, reason: row.reason, loginAt: row.loginAt, logoutAt: row.logoutAt, lastActivityAt: row.lastActivityAt, activity: loginActivityStatus(row) })), page: currentPage, totalPages, total, limit }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    const reference = await recordSystemError({ source: "LOGIN_HISTORY_API", path: "/api/login-history" });
    return NextResponse.json({ success: false, reference, message: `Login history is temporarily unavailable. Refresh to retry. Reference: ${reference}` }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
