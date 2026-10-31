"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "./ReportShell";

type Source = "GROCERY" | "BODEGA" | "OUTLET" | "CUSTOMER";
type Status = "OK" | "NO_LEDGER" | "MISMATCH" | "BROKEN_CHAIN";

type ReconciliationRow = {
  source: Source;
  inventoryId: string;
  productName: string;
  unit: string;
  masterStock: number;
  ledgerStock: number | null;
  difference: number | null;
  hasLedger: boolean;
  chainBreaks: number;
  status: Status;
};

type ReconciliationReport = {
  reconciledAt: string;
  balanced: boolean;
  summary: Record<Status, number> & { total: number };
  data: ReconciliationRow[];
};

const number = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString("en-PH", { maximumFractionDigits: 3 });

const statusStyle: Record<Status, string> = {
  OK: "bg-emerald-50 text-emerald-700",
  NO_LEDGER: "bg-amber-50 text-amber-700",
  MISMATCH: "bg-rose-50 text-rose-700",
  BROKEN_CHAIN: "bg-orange-50 text-orange-700",
};

export function InventoryReconciliationReportPageClient({ scope = "MAIN" }: { scope?: "MAIN" | "OUTLET" }) {
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"ALL" | Source>("ALL");
  const [status, setStatus] = useState<"ISSUES" | "ALL" | Status>("ISSUES");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reports/inventory-reconciliation?scope=${scope}`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || "Failed to reconcile inventory.");
      }
      setReport(json as ReconciliationReport);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reconcile inventory."
      );
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const keyword = search.trim().toUpperCase();
    return (report?.data || []).filter((row) => {
      if (source !== "ALL" && row.source !== source) return false;
      if (status === "ISSUES" && row.status === "OK") return false;
      if (status !== "ALL" && status !== "ISSUES" && row.status !== status) {
        return false;
      }
      return !keyword || row.productName.toUpperCase().includes(keyword);
    });
  }, [report, search, source, status]);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{scope === "OUTLET" ? "Outlet" : "Main"} Inventory Reconciliation</h1>
          <p className="text-sm text-slate-500">
            Compare current inventory balances with the latest stock ledger and
            detect missing or broken transaction history.
          </p>
          {report ? (
            <p className="mt-1 text-xs text-slate-400">
              Checked: {new Date(report.reconciledAt).toLocaleString("en-PH")}
            </p>
          ) : null}
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          Reconcile Now
        </Button>
      </div>

      {report ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Inventory balances" value={number(report.summary.total)} />
          <StatCard label="Balanced" value={number(report.summary.OK)} highlight="good" />
          <StatCard label="Mismatches" value={number(report.summary.MISMATCH)} highlight={report.summary.MISMATCH ? "bad" : "good"} />
          <StatCard label="Missing ledgers" value={number(report.summary.NO_LEDGER)} highlight={report.summary.NO_LEDGER ? "bad" : "good"} />
          <StatCard label="Broken chains" value={number(report.summary.BROKEN_CHAIN)} highlight={report.summary.BROKEN_CHAIN ? "bad" : "good"} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="min-w-64 flex-1">
          <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
            Search product
          </label>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Enter product name..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
            Inventory
          </label>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as typeof source)}
            className="h-9 rounded-lg border border-input bg-white px-3 text-sm"
          >
            <option value="ALL">All inventory</option>
            {scope === "MAIN" ? <><option value="GROCERY">Grocery</option><option value="BODEGA">Bodega</option><option value="CUSTOMER">Customer</option></> : <option value="OUTLET">Outlet</option>}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
            Result
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className="h-9 rounded-lg border border-input bg-white px-3 text-sm"
          >
            <option value="ISSUES">Issues only</option>
            <option value="ALL">All results</option>
            <option value="OK">Balanced</option>
            <option value="MISMATCH">Mismatch</option>
            <option value="NO_LEDGER">Missing ledger</option>
            <option value="BROKEN_CHAIN">Broken chain</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        {loading && !report ? (
          <div className="flex justify-center py-16 text-slate-400">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-slate-950 text-left text-white">
              <tr>
                <th className="p-3 font-semibold">Inventory</th>
                <th className="p-3 font-semibold">Product</th>
                <th className="p-3 font-semibold">Unit</th>
                <th className="p-3 text-right font-semibold">Current Stock</th>
                <th className="p-3 text-right font-semibold">Ledger Stock</th>
                <th className="p-3 text-right font-semibold">Difference</th>
                <th className="p-3 text-right font-semibold">Chain Breaks</th>
                <th className="p-3 text-center font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.source}:${row.inventoryId}:${row.unit}`}
                  className="border-t border-slate-100"
                >
                  <td className="p-3">{row.source}</td>
                  <td className="p-3 font-semibold">{row.productName}</td>
                  <td className="p-3">{row.unit}</td>
                  <td className="p-3 text-right">{number(row.masterStock)}</td>
                  <td className="p-3 text-right">{number(row.ledgerStock)}</td>
                  <td className={`p-3 text-right font-semibold ${row.difference ? "text-rose-600" : ""}`}>
                    {number(row.difference)}
                  </td>
                  <td className="p-3 text-right">{number(row.chainBreaks)}</td>
                  <td className="p-3 text-center">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[row.status]}`}>
                      {row.status.replaceAll("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && rows.length === 0 ? (
          <p className="py-12 text-center text-slate-500">
            No reconciliation results match the selected filters.
          </p>
        ) : null}
      </div>
    </div>
  );
}
