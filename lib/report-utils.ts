// lib/report-utils.ts
//
// Shared helpers for the standard business reports (Sales, Inventory, Payments).

import {
  addDays,
  startOfDayManila,
  startOfMonthManila,
  startOfNextMonthManila,
} from "@/lib/date-utils";

/**
 * Resolves a report date range from query params. Supports
 * preset=today|week|month, or a custom from/to (YYYY-MM-DD). Defaults to the
 * current month. `end` is exclusive (start of the day after `to`).
 *
 * Mirrors the Outlet Profit range parser so every report reads the same params.
 */
export function parseReportRange(searchParams: URLSearchParams) {
  const preset = String(searchParams.get("preset") || "").trim().toLowerCase();
  const now = new Date();

  let start = startOfMonthManila(now);
  let end = startOfNextMonthManila(now);

  if (preset === "today") {
    start = startOfDayManila(now);
    end = addDays(start, 1);
  } else if (preset === "week") {
    const manilaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const day = manilaNow.getUTCDay(); // 0 = Sun
    const diff = (day + 6) % 7; // days since Monday
    start = addDays(startOfDayManila(now), -diff);
    end = addDays(start, 7);
  } else if (preset === "month") {
    // default already set
  } else {
    const from = String(searchParams.get("from") || "").trim();
    const to = String(searchParams.get("to") || "").trim();
    if (from) {
      const d = new Date(`${from}T00:00:00+08:00`);
      if (!Number.isNaN(d.getTime())) start = d;
    }
    if (to) {
      const d = new Date(`${to}T00:00:00+08:00`);
      if (!Number.isNaN(d.getTime())) {
        end = addDays(d, 1);
      }
    }
  }

  return { start, end };
}

export function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
