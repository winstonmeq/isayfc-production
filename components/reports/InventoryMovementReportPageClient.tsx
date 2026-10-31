"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  ReportShell,
  buildRangeParams,
  type Preset,
} from "./ReportShell";

type MovementRow = {
  id: string;
  source: "GROCERY" | "BODEGA" | "OUTLET";
  location: string;
  productName: string;
  categoryName: string;
  baseUnit: string;
  packingUnit: string;
  multiplier: number;
  opening: number;
  openingDisplay: string;
  stockIn: number;
  stockInDisplay: string;
  salesOut: number;
  salesOutDisplay: string;
  deductions: number;
  deductionsDisplay: string;
  otherOut: number;
  otherOutDisplay: string;
  adjustment: number;
  adjustmentDisplay: string;
  closing: number;
  closingDisplay: string;
  movementCount: number;
};

type MovementReport = {
  range: { start: string; end: string };
  generatedAt: string;
  data: MovementRow[];
  locationOptions: string[];
  summary: {
    products: number;
    movementCount: number;
    stockIn: number;
    salesOut: number;
    deductions: number;
    otherOut: number;
  };
};

export function InventoryMovementReportPageClient({ scope = "MAIN" }: { scope?: "MAIN" | "OUTLET" }) {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [location, setLocation] = useState("");
  const [data, setData] = useState<MovementReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (preset === "custom" && (!from || !to)) {
      toast.error("Pick both a start and end date.");
      return;
    }

    setLoading(true);
    try {
      const params = buildRangeParams({ preset, from, to });
      params.set("scope", scope);
      if (location) params.set("location", location);
      const response = await fetch(
        `/api/reports/inventory-movements?${params.toString()}`,
        { cache: "no-store" }
      );
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || "Failed to load movement report.");
      }
      setData(json as MovementReport);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load movement report."
      );
    } finally {
      setLoading(false);
    }
  }, [preset, from, to, scope, location]);

  useEffect(() => {
    if (preset === "custom") return;
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [preset, load]);

  const periodLabel = data
    ? `${new Date(data.range.start).toLocaleDateString()} – ${new Date(
        new Date(data.range.end).getTime() - 1
      ).toLocaleDateString()}`
    : undefined;

  return (
    <ReportShell
      title={scope === "OUTLET" ? "Outlet Stock Movement Report" : "Main Inventory Movement Report"}
      subtitle={scope === "OUTLET" ? "Outlet-only opening stock, receipts, production consumption, sales, deductions, and closing balances." : "Bodega and grocery movements and closing stock. Outlet balances are excluded."}
      generatedAt={data?.generatedAt}
      periodLabel={periodLabel}
      preset={preset}
      from={from}
      to={to}
      onPreset={setPreset}
      onFrom={setFrom}
      onTo={setTo}
      onApply={load}
      extraFilters={scope === "OUTLET" ? <label className="text-sm font-semibold">Outlet <select className="h-10 rounded-lg border bg-white px-3" value={location} onChange={(event) => setLocation(event.target.value)}><option value="">All Outlets</option>{data?.locationOptions?.map((name) => <option key={name} value={name}>{name}</option>)}</select></label> : undefined}
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : !data ? null : (
        <>
          <p className="text-xs text-slate-500">
            Every movement and balance uses the product&apos;s configured unit.
            Pack products show full packs plus loose pieces.
          </p>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="p-2.5 font-semibold">Location</th>
                  <th className="p-2.5 font-semibold">Product</th>
                  <th className="p-2.5 font-semibold">Unit</th>
                  <th className="p-2.5 text-right font-semibold">Opening</th>
                  <th className="p-2.5 text-right font-semibold">Stock In</th>
                  <th className="p-2.5 text-right font-semibold">Sales</th>
                  <th className="p-2.5 text-right font-semibold">Deduction</th>
                  <th className="p-2.5 text-right font-semibold">Other Out</th>
                  <th className="p-2.5 text-right font-semibold">Adjustment</th>
                  <th className="p-2.5 text-right font-semibold">Closing</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="p-2.5">{row.location}</td>
                    <td className="p-2.5">
                      <p className="font-medium">{row.productName}</p>
                      <p className="text-xs text-slate-400">{row.categoryName}</p>
                    </td>
                    <td className="p-2.5">
                      {row.packingUnit}
                      {row.multiplier > 1 ? ` (${row.multiplier}/${row.packingUnit.toLowerCase()})` : ""}
                    </td>
                    <td className="p-2.5 text-right">{row.openingDisplay}</td>
                    <td className="p-2.5 text-right text-emerald-700">
                      {row.stockInDisplay}
                    </td>
                    <td className="p-2.5 text-right">{row.salesOutDisplay}</td>
                    <td className="p-2.5 text-right text-rose-700">
                      {row.deductionsDisplay}
                    </td>
                    <td className="p-2.5 text-right">{row.otherOutDisplay}</td>
                    <td className="p-2.5 text-right">
                      {row.adjustmentDisplay}
                    </td>
                    <td className="p-2.5 text-right font-semibold">
                      {row.closingDisplay}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.data.length === 0 ? (
              <p className="py-12 text-center text-slate-500">
                No inventory balances or movements were found.
              </p>
            ) : null}
          </div>
        </>
      )}
    </ReportShell>
  );
}
