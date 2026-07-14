// lib/outlet-profit.ts
//
// Shared logic for Outlet Profit reporting. Cost of goods sold (COGS) is
// derived from the outlet stock ledger: each SALE transaction records the
// quantity sold; the unit cost comes from the matching OutletInventory's
// `buyingPrice`.
//
// CAVEAT: buyingPrice is the CURRENT cost, not a snapshot at the moment of
// sale. If an item's buying price changes over time, historical COGS uses
// today's cost. This is acceptable while costs are stable; for an exact ledger,
// snapshot unitCost onto the SALE transaction at write time and read that here.

import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import { cleanString } from "@/lib/crud-utils";

/**
 * Resolves a reporting date range from query params. Supports
 * preset=today|week|month, or a custom from/to (YYYY-MM-DD). Defaults to the
 * current month. End is exclusive. Shared by the list and drill-down routes so
 * both interpret the same params identically.
 */
export function parseRange(searchParams: URLSearchParams) {
  const preset = cleanString(searchParams.get("preset")).toLowerCase();
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
    const from = cleanString(searchParams.get("from"));
    const to = cleanString(searchParams.get("to"));
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

/**
 * COGS per outlet for SALE transactions within [start, end).
 * Returns a Map<outletId, cogs>.
 */
export async function cogsByOutlet(
  start: Date,
  end: Date
): Promise<Map<string, number>> {
  const rows = await OutletStockTransactionModel.aggregate<{
    _id: unknown;
    cogs?: number;
  }>([
    {
      $match: {
        type: "SALE",
        transactionDate: { $gte: start, $lt: end },
      },
    },
    {
      $lookup: {
        from: "outletinventories",
        localField: "outletInventoryId",
        foreignField: "_id",
        as: "inv",
      },
    },
    {
      $project: {
        outletId: 1,
        cost: {
          $multiply: [
            "$quantity",
            {
              $ifNull: [
                { $arrayElemAt: ["$inv.buyingPrice", 0] },
                0,
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$outletId",
        cogs: { $sum: "$cost" },
      },
    },
  ]);

  const map = new Map<string, number>();
  for (const r of rows) {
    if (r._id) map.set(String(r._id), Number(r.cogs || 0));
  }
  return map;
}

/** Gross margin as a percentage of revenue (0 when revenue is 0). */
export function marginPct(grossProfit: number, revenue: number): number {
  if (revenue <= 0) return 0;
  return Math.round((grossProfit / revenue) * 1000) / 10; // one decimal place
}
