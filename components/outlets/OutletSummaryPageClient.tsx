"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Row = {
  outletId: string;
  name: string;
  code: string;
  isActive: boolean;
  salesTotal: number;
  salesCount: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  expenseTotal: number;
  expenseCount: number;
  net: number;
};

type Totals = {
  salesTotal: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  expenseTotal: number;
  net: number;
  salesCount: number;
};

type Preset = "today" | "week" | "month" | "custom";

const peso = (n: number) =>
  `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function OutletSummaryPageClient() {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailOutlet, setDetailOutlet] = useState<Row | null>(null);
  const [selectedOutletId, setSelectedOutletId] = useState<string>("all");

  // Build the same query string the detail fetch needs, so the drawer respects
  // the current filter.
  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (preset === "custom") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    } else {
      params.set("preset", preset);
    }
    return params;
  }, [preset, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (preset === "custom" && (!from || !to)) {
        toast.error("Pick both a start and end date.");
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/outlet-summary?${buildParams().toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setRows(json.rows || []);
      } else {
        toast.error(json.message || "Failed to load profit.");
      }
    } catch {
      toast.error("Failed to load profit.");
    } finally {
      setLoading(false);
    }
  }, [preset, from, to, buildParams]);

  // Auto-load for presets; custom waits for Apply. Deferred so the effect body
  // doesn't call setState synchronously (avoids cascading-render warning).
  useEffect(() => {
    if (preset === "custom") return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const presetLabel: Record<Exclude<Preset, "custom">, string> = {
    today: "Today",
    week: "This Week",
    month: "This Month",
  };

  // Outlet filter: "all" shows every outlet; otherwise narrow to the selected
  // one. Totals/cards recompute from the visible rows so they match the view.
  const visibleRows =
    selectedOutletId === "all"
      ? rows
      : rows.filter((r) => r.outletId === selectedOutletId);

  const visibleTotals: Totals | null =
    rows.length === 0
      ? null
      : visibleRows.reduce(
          (acc, r) => {
            acc.salesTotal += r.salesTotal;
            acc.cogs += r.cogs;
            acc.grossProfit += r.grossProfit;
            acc.expenseTotal += r.expenseTotal;
            acc.net += r.net;
            acc.salesCount += r.salesCount;
            acc.marginPct =
              acc.salesTotal > 0
                ? Math.round((acc.grossProfit / acc.salesTotal) * 1000) / 10
                : 0;
            return acc;
          },
          {
            salesTotal: 0,
            cogs: 0,
            grossProfit: 0,
            marginPct: 0,
            expenseTotal: 0,
            net: 0,
            salesCount: 0,
          }
        );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-6 text-rose-600" />
          <h1 className="text-2xl font-black">Outlet Profit</h1>
        </div>
        <p className="text-sm text-slate-500">
          Sales, cost of goods, gross profit, expenses, and net profit per
          outlet. Tap an outlet for a full breakdown.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        {(["today", "week", "month"] as const).map((p) => (
          <Button
            key={p}
            variant={preset === p ? "default" : "outline"}
            className={preset === p ? "bg-rose-600 hover:bg-rose-700" : ""}
            onClick={() => setPreset(p)}
          >
            {presetLabel[p]}
          </Button>
        ))}
        <Button
          variant={preset === "custom" ? "default" : "outline"}
          className={preset === "custom" ? "bg-rose-600 hover:bg-rose-700" : ""}
          onClick={() => setPreset("custom")}
        >
          Custom
        </Button>

        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-40"
              />
            </div>
            <Button onClick={load} className="bg-rose-600 hover:bg-rose-700">
              Apply
            </Button>
          </div>
        )}

        {/* Outlet selector — narrows the table/cards to one outlet. */}
        <div className="ml-auto space-y-1">
          <Label className="text-xs">Outlet</Label>
          <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All outlets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outlets</SelectItem>
              {[...rows]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((r) => (
                  <SelectItem key={r.outletId} value={r.outletId}>
                    {r.name}
                    {r.code ? ` (${r.code})` : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Totals cards */}
      {visibleTotals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Sales" value={peso(visibleTotals.salesTotal)} />
          <SummaryCard label="Cost of Goods" value={peso(visibleTotals.cogs)} />
          <SummaryCard
            label="Gross Profit"
            value={peso(visibleTotals.grossProfit)}
            highlight={visibleTotals.grossProfit >= 0 ? "good" : "bad"}
          />
          <SummaryCard
            label="Margin"
            value={`${visibleTotals.marginPct.toFixed(1)}%`}
          />
          <SummaryCard label="Expenses" value={peso(visibleTotals.expenseTotal)} />
          <SummaryCard
            label="Net Profit"
            value={peso(visibleTotals.net)}
            highlight={visibleTotals.net >= 0 ? "good" : "bad"}
          />
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
          {rows.length === 0 ? "No outlets found." : "No data for this outlet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-3 font-semibold">Outlet</th>
                <th className="p-3 text-right font-semibold">Sales</th>
                <th className="p-3 text-right font-semibold">COGS</th>
                <th className="p-3 text-right font-semibold">Gross Profit</th>
                <th className="p-3 text-right font-semibold">Margin</th>
                <th className="p-3 text-right font-semibold">Expenses</th>
                <th className="p-3 text-right font-semibold">Net Profit</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr
                  key={r.outletId}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => setDetailOutlet(r)}
                >
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{r.name}</div>
                    {r.code ? (
                      <div className="text-xs text-slate-400">{r.code}</div>
                    ) : null}
                  </td>
                  <td className="p-3 text-right font-medium">
                    {peso(r.salesTotal)}
                  </td>
                  <td className="p-3 text-right text-slate-500">
                    {peso(r.cogs)}
                  </td>
                  <td className="p-3 text-right font-medium text-slate-700">
                    {peso(r.grossProfit)}
                  </td>
                  <td className="p-3 text-right text-slate-500">
                    {r.marginPct.toFixed(1)}%
                  </td>
                  <td className="p-3 text-right text-slate-600">
                    {peso(r.expenseTotal)}
                  </td>
                  <td
                    className={`p-3 text-right font-bold ${
                      r.net >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {peso(r.net)}
                  </td>
                </tr>
              ))}
            </tbody>
            {visibleTotals && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <tr>
                  <td className="p-3">
                    {selectedOutletId === "all" ? "All Outlets" : "Selected"}
                  </td>
                  <td className="p-3 text-right">
                    {peso(visibleTotals.salesTotal)}
                  </td>
                  <td className="p-3 text-right text-slate-500">
                    {peso(visibleTotals.cogs)}
                  </td>
                  <td className="p-3 text-right">
                    {peso(visibleTotals.grossProfit)}
                  </td>
                  <td className="p-3 text-right text-slate-500">
                    {visibleTotals.marginPct.toFixed(1)}%
                  </td>
                  <td className="p-3 text-right">
                    {peso(visibleTotals.expenseTotal)}
                  </td>
                  <td
                    className={`p-3 text-right ${
                      visibleTotals.net >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {peso(visibleTotals.net)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Profit uses each outlet&apos;s buying price for cost of goods. Only sales
        and expenses recorded on the cashier app are tied to a specific outlet.
      </p>

      <OutletDetailSheet
        outlet={detailOutlet}
        params={buildParams()}
        onClose={() => setDetailOutlet(null)}
      />
    </div>
  );
}

// --- Per-outlet drill-down ---

type DetailProduct = {
  productName: string;
  qty: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number;
};
type DetailExpense = { type: string; total: number; count: number };
type DetailDay = {
  day: string;
  revenue: number;
  cost: number;
  expense: number;
  net: number;
};
type Detail = {
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    marginPct: number;
    expenseTotal: number;
    net: number;
  };
  products: DetailProduct[];
  expenses: DetailExpense[];
  daily: DetailDay[];
};

function OutletDetailSheet({
  outlet,
  params,
  onClose,
}: {
  outlet: Row | null;
  params: URLSearchParams;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Defer the synchronous resets so they don't run in the effect body
    // (avoids the cascading-render lint rule); the fetch's own callbacks set
    // state asynchronously, which is fine.
    const t = setTimeout(() => {
      if (cancelled) return;
      setDetail(null);
      if (!outlet) return;
      setLoading(true);
      fetch(`/api/outlet-summary/${outlet.outletId}?${params.toString()}`, {
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((json) => {
          if (cancelled) return;
          if (json.success) setDetail(json as Detail);
          else toast.error(json.message || "Failed to load details.");
        })
        .catch(() => {
          if (!cancelled) toast.error("Failed to load details.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [outlet, params]);

  return (
    <Sheet open={!!outlet} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{outlet?.name || "Outlet"}</SheetTitle>
          <SheetDescription>
            {outlet?.code ? `${outlet.code} • ` : ""}Profit breakdown for the
            selected period.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : !detail ? (
          <div className="py-16 text-center text-sm text-slate-400">
            No data for this period.
          </div>
        ) : (
          <div className="space-y-6 p-4">
            {/* Profit summary */}
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Sales" value={peso(detail.totals.revenue)} />
              <MiniStat label="Cost of Goods" value={peso(detail.totals.cogs)} />
              <MiniStat
                label="Gross Profit"
                value={peso(detail.totals.grossProfit)}
                tone={detail.totals.grossProfit >= 0 ? "good" : "bad"}
              />
              <MiniStat
                label="Margin"
                value={`${detail.totals.marginPct.toFixed(1)}%`}
              />
              <MiniStat
                label="Expenses"
                value={peso(detail.totals.expenseTotal)}
              />
              <MiniStat
                label="Net Profit"
                value={peso(detail.totals.net)}
                tone={detail.totals.net >= 0 ? "good" : "bad"}
              />
            </div>

            {/* Top products */}
            <Section title="Top Products">
              {detail.products.length === 0 ? (
                <Empty>No products sold.</Empty>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="p-2 font-semibold">Product</th>
                        <th className="p-2 text-right font-semibold">Qty</th>
                        <th className="p-2 text-right font-semibold">Sales</th>
                        <th className="p-2 text-right font-semibold">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.products.map((p) => (
                        <tr
                          key={p.productName}
                          className="border-t border-slate-100"
                        >
                          <td className="p-2">{p.productName}</td>
                          <td className="p-2 text-right">{p.qty}</td>
                          <td className="p-2 text-right">{peso(p.revenue)}</td>
                          <td
                            className={`p-2 text-right font-semibold ${
                              p.grossProfit >= 0
                                ? "text-emerald-600"
                                : "text-rose-600"
                            }`}
                          >
                            {peso(p.grossProfit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Expenses by type */}
            <Section title="Expenses by Type">
              {detail.expenses.length === 0 ? (
                <Empty>No expenses recorded.</Empty>
              ) : (
                <div className="space-y-1">
                  {detail.expenses.map((e) => (
                    <div
                      key={e.type}
                      className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-600">
                        {e.type.replaceAll("_", " ")}
                        <span className="ml-1 text-xs text-slate-400">
                          ({e.count})
                        </span>
                      </span>
                      <span className="font-medium">{peso(e.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Daily series */}
            <Section title="Daily">
              {detail.daily.length === 0 ? (
                <Empty>No activity.</Empty>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="p-2 font-semibold">Day</th>
                        <th className="p-2 text-right font-semibold">Sales</th>
                        <th className="p-2 text-right font-semibold">Expenses</th>
                        <th className="p-2 text-right font-semibold">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.daily.map((d) => (
                        <tr key={d.day} className="border-t border-slate-100">
                          <td className="p-2">{d.day}</td>
                          <td className="p-2 text-right">{peso(d.revenue)}</td>
                          <td className="p-2 text-right text-slate-500">
                            {peso(d.expense)}
                          </td>
                          <td
                            className={`p-2 text-right font-semibold ${
                              d.net >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {peso(d.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
      {children}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={`mt-0.5 text-base font-black ${
          tone === "good"
            ? "text-emerald-600"
            : tone === "bad"
              ? "text-rose-600"
              : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-black ${
          highlight === "good"
            ? "text-emerald-600"
            : highlight === "bad"
              ? "text-rose-600"
              : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
