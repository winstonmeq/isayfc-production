// lib/report-utils.ts
//
// Shared helpers for the standard business reports (Sales, Inventory, Payments).

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

  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  let end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  if (preset === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (preset === "week") {
    const day = now.getDay(); // 0 = Sun
    const diff = (day + 6) % 7; // days since Monday
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  } else if (preset === "month") {
    // default already set
  } else {
    const from = String(searchParams.get("from") || "").trim();
    const to = String(searchParams.get("to") || "").trim();
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) start = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
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
