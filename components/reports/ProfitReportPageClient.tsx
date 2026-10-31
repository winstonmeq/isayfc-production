"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  ReportShell,
  StatCard,
  peso,
  buildRangeParams,
  type Preset,
} from "./ReportShell";

type ExpenseRow = { type: string; name?: string; total: number; count: number };
type ProfitReport = {
  range: { start: string; end: string };
  generatedAt: string;
  revenue: { total: number; chicken: number; grocery: number; grossSales: number; grossChicken: number; grossGrocery: number; discounts: number; chickenDiscounts: number; groceryDiscounts: number };
  cogs: { total: number; chicken: number; grocery: number };
  grossProfit: number;
  grossMarginPct: number;
  expenses: ExpenseRow[];
  expenseTotal: number;
  netProfit: number;
  netMarginPct: number;
};

export function ProfitReportPageClient() {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<ProfitReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (preset === "custom" && (!from || !to)) {
        toast.error("Pick both a start and end date.");
        setLoading(false);
        return;
      }
      const params = buildRangeParams({ preset, from, to });
      const res = await fetch(`/api/reports/profit?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.success) setData(json as ProfitReport);
      else toast.error(json.message || "Failed to load report.");
    } catch {
      toast.error("Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [preset, from, to]);

  useEffect(() => {
    if (preset === "custom") return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const periodLabel = data
    ? `${new Date(data.range.start).toLocaleDateString()} – ${new Date(
        new Date(data.range.end).getTime() - 1
      ).toLocaleDateString()}`
    : undefined;

  return (
    <ReportShell
      title="Profit Report"
      subtitle="Main-company income statement for Chicken and Grocery operations."
      generatedAt={data?.generatedAt}
      periodLabel={periodLabel}
      preset={preset}
      from={from}
      to={to}
      onPreset={setPreset}
      onFrom={setFrom}
      onTo={setTo}
      onApply={load}
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Net Sales" value={peso(data.revenue.total)} />
            <StatCard
              label="Gross Profit"
              value={peso(data.grossProfit)}
              highlight={data.grossProfit >= 0 ? "good" : "bad"}
            />
            <StatCard
              label="Expenses"
              value={peso(data.expenseTotal)}
            />
            <StatCard
              label="Net Profit"
              value={peso(data.netProfit)}
              highlight={data.netProfit >= 0 ? "good" : "bad"}
            />
          </div>

          {/* Income statement */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 print-break">
            <table className="w-full text-sm">
              <tbody>
                <SectionHeader label="Revenue" />
                <Line label="Chicken Gross Sales" value={data.revenue.grossChicken} indent />
                <Line label="Grocery Gross Sales" value={data.revenue.grossGrocery} indent />
                <Subtotal label="Gross Sales" value={data.revenue.grossSales} />
                <Line label="Less: Chicken Sales Discounts" value={data.revenue.chickenDiscounts} indent negative />
                <Line label="Less: Grocery Sales Discounts" value={data.revenue.groceryDiscounts} indent negative />
                <Subtotal label="Total Sales Discounts" value={data.revenue.discounts} negative />
                <Subtotal label="Net Sales" value={data.revenue.total} />

                <SectionHeader label="Cost of Goods Sold" />
                <Line label="Chicken COGS" value={data.cogs.chicken} indent negative />
                <Line label="Grocery COGS" value={data.cogs.grocery} indent negative />
                <Subtotal label="Total COGS" value={data.cogs.total} negative />

                <Subtotal
                  label="Gross Profit"
                  value={data.grossProfit}
                  emphasize
                  suffix={`${data.grossMarginPct.toFixed(1)}% margin`}
                />

                <SectionHeader label="Operating Expenses" />
                {data.expenses.length === 0 ? (
                  <tr className="border-t border-slate-100">
                    <td className="py-2 pl-8 text-slate-400" colSpan={2}>
                      No expenses in this period.
                    </td>
                  </tr>
                ) : (
                  data.expenses.map((e) => (
                    <Line
                      key={e.type}
                      label={`${e.name || e.type.replaceAll("_", " ")} (${e.count})`}
                      value={e.total}
                      indent
                      negative
                    />
                  ))
                )}
                <Subtotal
                  label="Total Expenses"
                  value={data.expenseTotal}
                  negative
                />

                <tr className="border-t-2 border-slate-300 bg-slate-100">
                  <td className="px-4 py-3 text-base font-black">Net Profit</td>
                  <td
                    className={`px-4 py-3 text-right text-base font-black ${
                      data.netProfit >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {peso(data.netProfit)}
                    <span className="ml-2 text-xs font-medium text-slate-400">
                      {data.netMarginPct.toFixed(1)}% net margin
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400">
            Net sales = gross sales − sales discounts. Gross profit = net sales − cost of goods sold.
            Sales discounts are deducted from revenue once and are excluded from operating expenses.
          </p>
        </>
      )}
    </ReportShell>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="border-t border-slate-200 bg-slate-50">
      <td className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </td>
      <td className="bg-slate-50" />
    </tr>
  );
}

function Line({
  label,
  value,
  indent,
  negative,
}: {
  label: string;
  value: number;
  indent?: boolean;
  negative?: boolean;
}) {
  return (
    <tr className="border-t border-slate-100">
      <td className={`py-2 ${indent ? "pl-8" : "px-4"} text-slate-600`}>
        {label}
      </td>
      <td className="px-4 py-2 text-right text-slate-700">
        {negative ? `(${peso(value)})` : peso(value)}
      </td>
    </tr>
  );
}

function Subtotal({
  label,
  value,
  negative,
  emphasize,
  suffix,
}: {
  label: string;
  value: number;
  negative?: boolean;
  emphasize?: boolean;
  suffix?: string;
}) {
  return (
    <tr
      className={`border-t border-slate-200 ${
        emphasize ? "bg-emerald-50" : "bg-slate-50/60"
      }`}
    >
      <td className="px-4 py-2 font-bold text-slate-800">{label}</td>
      <td
        className={`px-4 py-2 text-right font-bold ${
          emphasize ? "text-emerald-700" : "text-slate-800"
        }`}
      >
        {negative ? `(${peso(value)})` : peso(value)}
        {suffix ? (
          <span className="ml-2 text-xs font-medium text-slate-400">
            {suffix}
          </span>
        ) : null}
      </td>
    </tr>
  );
}
