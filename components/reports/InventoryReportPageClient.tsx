"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ReportShell, StatCard, peso, qtyFmt, type Preset } from "./ReportShell";

type Row = {
  id: string;
  name: string;
  categoryName: string;
  stockPcs: number;
  buyingPrice: number;
  unitPrice: number;
  costValue: number;
  retailValue: number;
  potentialMargin: number;
  lowStockAlert: number;
  stockStatus: "OUT" | "LOW" | "OK";
  source: "GROCERY" | "BODEGA" | "OUTLET";
  location: string;
  unitLabel: string;
  packSize: number;
  stockDisplay: string;
};
type InventoryReport = {
  generatedAt: string;
  rows: Row[];
  categoryOptions: string[];
  grand: {
    items: number;
    stockPcs: number;
    costValue: number;
    retailValue: number;
    potentialMargin: number;
    lowStock: number;
    outOfStock: number;
  };
};

type StockFilter = "all" | "in" | "low" | "zero";

export function InventoryReportPageClient() {
  const [stock, setStock] = useState<StockFilter>("all");
  const [category, setCategory] = useState("");
  const [data, setData] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stock !== "all") params.set("stock", stock);
      if (category) params.set("category", category);
      const qs = params.toString();
      const res = await fetch(`/api/reports/inventory${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.success) setData(json as InventoryReport);
      else toast.error(json.message || "Failed to load report.");
    } catch {
      toast.error("Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [stock, category]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock, category]);

  const statusBadge = (s: Row["stockStatus"]) =>
    s === "OUT"
      ? "bg-rose-100 text-rose-700"
      : s === "LOW"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";

  return (
    <ReportShell
      title="Inventory Report"
      subtitle="Stock-on-hand valuation at cost and retail, as of now."
      generatedAt={data?.generatedAt}
      periodLabel="As of today"
      showRange={false}
      preset={"month" as Preset}
      from=""
      to=""
      onPreset={() => {}}
      onFrom={() => {}}
      onTo={() => {}}
      onApply={() => {}}
      extraFilters={
        <>
          <div className="flex items-end gap-1 rounded-lg border border-slate-200 p-1">
            {([
              ["all", "All"],
              ["in", "In Stock"],
              ["low", "Low"],
              ["zero", "Out"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStock(key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  stock === key
                    ? "bg-rose-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            aria-label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-10 min-w-52 rounded-lg border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">All Categories</option>
            {(data?.categoryOptions || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Items" value={qtyFmt(data.grand.items)} />
            <StatCard
              label="Inventory Value (Cost)"
              value={peso(data.grand.costValue)}
              highlight="good"
            />
            <StatCard
              label="Retail Value"
              value={peso(data.grand.retailValue)}
            />
            <StatCard
              label="Low Stock"
              value={qtyFmt(data.grand.lowStock)}
              highlight={data.grand.lowStock > 0 ? "bad" : undefined}
            />
            <StatCard
              label="Out of Stock"
              value={qtyFmt(data.grand.outOfStock)}
              highlight={data.grand.outOfStock > 0 ? "bad" : undefined}
            />
          </div>

          {data.rows.length === 0 ? (
              <Empty>No products match this filter.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="p-2.5 font-semibold">Product</th>
                      <th className="p-2.5 font-semibold">Location</th>
                      <th className="p-2.5 font-semibold">Category</th>
                      <th className="p-2.5 text-right font-semibold">Stock</th>
                      <th className="p-2.5 text-right font-semibold">Unit Cost</th>
                      <th className="p-2.5 text-right font-semibold">
                        Cost Value
                      </th>
                      <th className="p-2.5 text-right font-semibold">
                        Retail Value
                      </th>
                      <th className="p-2.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="p-2.5 font-medium">{r.name}</td>
                        <td className="p-2.5 text-slate-500">{r.location}</td>
                        <td className="p-2.5 text-slate-500">
                          {r.categoryName}
                        </td>
                        <td className="p-2.5 text-right">
                          {r.stockDisplay ||
                            `${qtyFmt(r.stockPcs)} ${r.unitLabel}`}
                        </td>
                        <td className="p-2.5 text-right text-slate-600">
                          {peso(r.buyingPrice)}
                        </td>
                        <td className="p-2.5 text-right font-medium">
                          {peso(r.costValue)}
                        </td>
                        <td className="p-2.5 text-right text-slate-600">
                          {peso(r.retailValue)}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge(
                              r.stockStatus
                            )}`}
                          >
                            {r.stockStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                    <tr>
                      <td className="p-2.5" colSpan={3}>
                        GRAND TOTAL ({data.grand.items})
                      </td>
                      <td className="p-2.5 text-right">
                        {qtyFmt(data.grand.stockPcs)}
                      </td>
                      <td />
                      <td className="p-2.5 text-right">
                        {peso(data.grand.costValue)}
                      </td>
                      <td className="p-2.5 text-right">
                        {peso(data.grand.retailValue)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
        </>
      )}
    </ReportShell>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
      {children}
    </div>
  );
}
