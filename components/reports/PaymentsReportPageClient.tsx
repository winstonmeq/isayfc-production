"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  ReportShell,
  StatCard,
  peso,
  qtyFmt,
  buildRangeParams,
  type Preset,
} from "./ReportShell";

type Collection = {
  id: string;
  paymentDate: string;
  day: string;
  customerName: string;
  referenceNumber: string;
  amount: number;
  applied: number;
  unapplied: number;
};
type CollDaily = {
  day: string;
  count: number;
  amount: number;
  applied: number;
  unapplied: number;
};
type AgingRow = {
  customerId: string;
  customerName: string;
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d90plus: number;
  total: number;
};
type PaymentsReport = {
  range: { start: string; end: string };
  generatedAt: string;
  collections: Collection[];
  collectionsDaily: CollDaily[];
  collectionsGrand: { count: number; amount: number; applied: number; unapplied: number };
  aging: AgingRow[];
  agingGrand: {
    current: number;
    d30: number;
    d60: number;
    d90: number;
    d90plus: number;
    total: number;
  };
};

export function PaymentsReportPageClient() {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<PaymentsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"collections" | "aging">("collections");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (preset === "custom" && (!from || !to)) {
        toast.error("Pick both a start and end date.");
        setLoading(false);
        return;
      }
      const params = buildRangeParams({ preset, from, to });
      const res = await fetch(`/api/reports/payments?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.success) setData(json as PaymentsReport);
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

  const collDays = data ? [...new Set(data.collections.map((c) => c.day))] : [];
  const dailyByDay = new Map((data?.collectionsDaily || []).map((d) => [d.day, d]));

  return (
    <ReportShell
      title="Payments Report"
      subtitle="Collections received in the period, plus accounts-receivable aging."
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
            <StatCard
              label="Collected"
              value={peso(data.collectionsGrand.amount)}
              highlight="good"
            />
            <StatCard
              label="Payments"
              value={qtyFmt(data.collectionsGrand.count)}
            />
            <StatCard
              label="Unapplied"
              value={peso(data.collectionsGrand.unapplied)}
            />
            <StatCard
              label="Total Receivable"
              value={peso(data.agingGrand.total)}
              highlight={data.agingGrand.total > 0 ? "bad" : undefined}
            />
          </div>

          <div className="no-print flex gap-1 border-b border-slate-200">
            {([
              ["collections", "Collections"],
              ["aging", "A/R Aging"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
                  tab === key
                    ? "border-rose-600 text-rose-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "collections" ? (
            data.collections.length === 0 ? (
              <Empty>No payments received in this period.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="p-2.5 font-semibold">Date</th>
                      <th className="p-2.5 font-semibold">Customer</th>
                      <th className="p-2.5 font-semibold">Reference</th>
                      <th className="p-2.5 text-right font-semibold">Amount</th>
                      <th className="p-2.5 text-right font-semibold">Applied</th>
                      <th className="p-2.5 text-right font-semibold">
                        Unapplied
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {collDays.map((day) => {
                      const dayRows = data.collections.filter(
                        (c) => c.day === day
                      );
                      const sub = dailyByDay.get(day);
                      return (
                        <CollDayGroup key={day} day={day} rows={dayRows} sub={sub} />
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                    <tr>
                      <td className="p-2.5" colSpan={3}>
                        GRAND TOTAL ({data.collectionsGrand.count})
                      </td>
                      <td className="p-2.5 text-right">
                        {peso(data.collectionsGrand.amount)}
                      </td>
                      <td className="p-2.5 text-right">
                        {peso(data.collectionsGrand.applied)}
                      </td>
                      <td className="p-2.5 text-right">
                        {peso(data.collectionsGrand.unapplied)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          ) : data.aging.length === 0 ? (
            <Empty>No outstanding receivables. 🎉</Empty>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="p-2.5 font-semibold">Customer</th>
                    <th className="p-2.5 text-right font-semibold">Current</th>
                    <th className="p-2.5 text-right font-semibold">1–30</th>
                    <th className="p-2.5 text-right font-semibold">31–60</th>
                    <th className="p-2.5 text-right font-semibold">61–90</th>
                    <th className="p-2.5 text-right font-semibold">90+</th>
                    <th className="p-2.5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.aging.map((r) => (
                    <tr key={r.customerId} className="border-t border-slate-100">
                      <td className="p-2.5 font-medium">{r.customerName}</td>
                      <td className="p-2.5 text-right">{peso(r.current)}</td>
                      <td className="p-2.5 text-right">{peso(r.d30)}</td>
                      <td className="p-2.5 text-right">{peso(r.d60)}</td>
                      <td className="p-2.5 text-right text-amber-700">
                        {peso(r.d90)}
                      </td>
                      <td className="p-2.5 text-right font-semibold text-rose-600">
                        {peso(r.d90plus)}
                      </td>
                      <td className="p-2.5 text-right font-bold">
                        {peso(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                  <tr>
                    <td className="p-2.5">GRAND TOTAL</td>
                    <td className="p-2.5 text-right">
                      {peso(data.agingGrand.current)}
                    </td>
                    <td className="p-2.5 text-right">
                      {peso(data.agingGrand.d30)}
                    </td>
                    <td className="p-2.5 text-right">
                      {peso(data.agingGrand.d60)}
                    </td>
                    <td className="p-2.5 text-right">
                      {peso(data.agingGrand.d90)}
                    </td>
                    <td className="p-2.5 text-right text-rose-600">
                      {peso(data.agingGrand.d90plus)}
                    </td>
                    <td className="p-2.5 text-right">
                      {peso(data.agingGrand.total)}
                    </td>
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

function CollDayGroup({
  day,
  rows,
  sub,
}: {
  day: string;
  rows: Collection[];
  sub?: CollDaily;
}) {
  return (
    <>
      {rows.map((c) => (
        <tr key={c.id} className="border-t border-slate-100">
          <td className="p-2.5 text-slate-500">{day}</td>
          <td className="p-2.5">{c.customerName}</td>
          <td className="p-2.5 text-slate-500">{c.referenceNumber || "—"}</td>
          <td className="p-2.5 text-right font-medium">{peso(c.amount)}</td>
          <td className="p-2.5 text-right text-slate-600">{peso(c.applied)}</td>
          <td className="p-2.5 text-right text-slate-600">{peso(c.unapplied)}</td>
        </tr>
      ))}
      {sub && (
        <tr className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
          <td className="p-2" colSpan={3}>
            Subtotal {day} ({sub.count})
          </td>
          <td className="p-2 text-right">{peso(sub.amount)}</td>
          <td className="p-2 text-right">{peso(sub.applied)}</td>
          <td className="p-2 text-right">{peso(sub.unapplied)}</td>
        </tr>
      )}
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
      {children}
    </div>
  );
}
