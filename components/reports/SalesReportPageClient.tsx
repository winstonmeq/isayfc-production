"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  ReportShell,
  StatCard,
  peso,
  qtyFmt,
  type Preset,
} from "./ReportShell";
import { buildRangeParams } from "./ReportShell";
import { toast } from "sonner";
import { MainReturnsTable, type MainReturnReportRow } from "./MainReturnsTable";

type RegisterRow = {
  grossSales: number;
  discounts: number;
  id: string;
  receiptNumber: string;
  saleDate: string;
  day: string;
  source: string;
  customerName: string;
  businessCategory?: string;
  qty: number;
  qtyDisplay: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  ownerOutletAmount: number;
  status: string;
};
type DailyRow = {
  grossSales: number;
  discounts: number;
  day: string;
  count: number;
  qty: number;
  qtyDisplay: string;
  total: number;
  paid: number;
  balance: number;
  ownerOutletAmount: number;
};
type Agg = {
  grossSales: number;
  discounts: number;
  name: string;
  qty: number;
  unit: "packs" | "qty";
  total: number;
  count: number;
};
type ChickenCutsMatrix = {
  products: string[];
  rows: Array<{ day: string; values: Record<string, number>; total: number }>;
  totals: Record<string, number>;
  grandTotal: number;
};
type SalesReport = {
  returns: MainReturnReportRow[];
  returnsTotal: number;
  netAfterReturns: number;
  range: { start: string; end: string };
  generatedAt: string;
  rows: RegisterRow[];
  daily: DailyRow[];
  grand: {
    grossSales: number;
    discounts: number;
    count: number;
    qty: number;
    qtyDisplay: string;
    total: number;
    paid: number;
    balance: number;
    ownerOutletAmount: number;
  };
  split: {
    cashCount: number;
    cashTotal: number;
    creditCount: number;
    creditTotal: number;
  };
  byProduct: Agg[];
  byCategory: Agg[];
  chickenCuts: ChickenCutsMatrix;
  discountSummary: { name: string; lines: number; amount: number }[];
};

type Tab = "register" | "chickenCuts" | "product" | "category" | "discounts";

export function SalesReportPageClient() {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] =
    useState<"ALL" | "CHICKEN" | "BODEGA">("ALL");
  const [data, setData] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("register");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (preset === "custom" && (!from || !to)) {
        toast.error("Pick both a start and end date.");
        setLoading(false);
        return;
      }
      const params = buildRangeParams({ preset, from, to });
      if (source !== "ALL") params.set("source", source);
      const res = await fetch(`/api/reports/sales?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.success) setData(json as SalesReport);
      else toast.error(json.message || "Failed to load report.");
    } catch {
      toast.error("Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [preset, from, to, source]);

  useEffect(() => {
    if (preset === "custom") return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, source]);

  const periodLabel = data
    ? `${new Date(data.range.start).toLocaleDateString()} – ${new Date(
        new Date(data.range.end).getTime() - 1
      ).toLocaleDateString()}`
    : undefined;

  return (
    <ReportShell
      title="Main Sales Report"
      subtitle="Main customer sales, including owner outlets. Outlet retail sales are reported separately."
      generatedAt={data?.generatedAt}
      periodLabel={periodLabel}
      preset={preset}
      from={from}
      to={to}
      onPreset={setPreset}
      onFrom={setFrom}
      onTo={setTo}
      onApply={load}
      extraFilters={
        <div className="flex items-end gap-1 rounded-lg border border-slate-200 p-1">
          {(["ALL", "CHICKEN", "BODEGA"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                source === s
                  ? "bg-rose-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {s === "ALL"
                ? "Main All"
                : s === "CHICKEN"
                  ? "Chicken"
                  : "Grocery"}
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : !data ? null : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Gross Sales" value={peso(data.grand.grossSales)} />
            <StatCard label="Sales Discounts" value={peso(data.grand.discounts)} />
            <StatCard label="Sales Returns" value={peso(data.returnsTotal || 0)} />
            <StatCard label="Net Sales after Returns" value={peso(data.netAfterReturns ?? data.grand.total)} />
            <StatCard label="Transactions" value={qtyFmt(data.grand.count)} />
            <StatCard
              label="Cash Sales"
              value={peso(data.split.cashTotal)}
              highlight="good"
            />
            <StatCard label="Credit Sales" value={peso(data.split.creditTotal)} />
            <StatCard
              label="Outstanding"
              value={peso(data.grand.balance)}
              highlight={data.grand.balance > 0 ? "bad" : undefined}
            />
          </div>

          <MainReturnsTable rows={data.returns} />
          {/* Tabs */}
          <div className="no-print flex gap-1 border-b border-slate-200">
            {([
              ["register", "Register"],
              ["chickenCuts", "Chicken Cuts"],
              ["product", "By Product"],
              ["category", "By Category"],
              ["discounts", "Discounts"],
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

          {tab === "register" && (
            <>
              <h2 className="text-lg font-bold">Customer Sales</h2>
              <RegisterTable rows={data.rows} daily={data.daily} grand={data.grand} />
            </>
          )}
          {tab === "product" && (
            <SummaryTable title="Sales by Product" rows={data.byProduct} />
          )}
          {tab === "category" && (
            <SummaryTable title="Sales by Category" rows={data.byCategory} />
          )}
          {tab === "chickenCuts" && (
            <ChickenCutsTable matrix={data.chickenCuts} />
          )}
          {tab === "discounts" && <DiscountSummaryTable rows={data.discountSummary} total={data.grand.discounts} />}
        </>
      )}
    </ReportShell>
  );
}

function ChickenCutsTable({ matrix }: { matrix: ChickenCutsMatrix }) {
  if (matrix.products.length === 0) {
    return <Empty>No chicken-cut sales in this period.</Empty>;
  }

  return (
    <div>
      <div className="mb-3 text-center">
        <h2 className="text-lg font-bold text-slate-900">ISAY CHICKEN</h2>
        <p className="font-semibold text-slate-700">CHICKEN CUTS</p>
        <p className="text-sm text-slate-500">DAILY NET SALES BY PRODUCT</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-max w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="sticky left-0 bg-slate-50 p-2.5 text-left font-semibold">
                Date
              </th>
              {matrix.products.map((product) => (
                <th key={product} className="p-2.5 text-right font-semibold">
                  {product}
                </th>
              ))}
              <th className="p-2.5 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.day} className="border-t border-slate-100">
                <td className="sticky left-0 bg-white p-2.5 font-medium">
                  {row.day}
                </td>
                {matrix.products.map((product) => (
                  <td key={product} className="p-2.5 text-right tabular-nums">
                    {peso(row.values[product] || 0)}
                  </td>
                ))}
                <td className="p-2.5 text-right font-semibold tabular-nums">
                  {peso(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
            <tr>
              <td className="sticky left-0 bg-slate-100 p-2.5">TOTAL SALES</td>
              {matrix.products.map((product) => (
                <td key={product} className="p-2.5 text-right tabular-nums">
                  {peso(matrix.totals[product] || 0)}
                </td>
              ))}
              <td className="p-2.5 text-right tabular-nums">
                {peso(matrix.grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function RegisterTable({
  rows,
  daily,
  grand,
}: {
  rows: RegisterRow[];
  daily: DailyRow[];
  grand: SalesReport["grand"];
}) {
  const dailyByDay = new Map(daily.map((d) => [d.day, d]));
  // Group rows by day to insert subtotal rows.
  const days = [...new Set(rows.map((r) => r.day))];

  if (rows.length === 0) {
    return <Empty>No sales in this period.</Empty>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="p-2.5 font-semibold">Date</th>
            <th className="p-2.5 font-semibold">Receipt</th>
            <th className="p-2.5 font-semibold">Customer</th>
            <th className="p-2.5 font-semibold">Source</th>
            <th className="p-2.5 text-right font-semibold">Sold Qty</th>
            <th className="p-2.5 text-right font-semibold">Gross Sales</th>
            <th className="p-2.5 text-right font-semibold">Discounts</th>
            <th className="p-2.5 text-right font-semibold">Net Sales</th>
            <th className="p-2.5 text-right font-semibold">Paid</th>
            <th className="p-2.5 text-right font-semibold">Balance</th>
            <th className="p-2.5 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const dayRows = rows.filter((r) => r.day === day);
            const sub = dailyByDay.get(day);
            return (
              <DayGroup key={day} day={day} rows={dayRows} sub={sub} />
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
          <tr>
            <td className="p-2.5" colSpan={4}>
              GRAND TOTAL ({grand.count})
            </td>
            <td className="p-2.5 text-right">{grand.qtyDisplay}</td>
            <td className="p-2.5 text-right">{peso(grand.grossSales)}</td>
            <td className="p-2.5 text-right">{peso(grand.discounts)}</td>
            <td className="p-2.5 text-right">{peso(grand.total)}</td>
            <td className="p-2.5 text-right">{peso(grand.paid)}</td>
            <td className="p-2.5 text-right">{peso(grand.balance)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DayGroup({
  day,
  rows,
  sub,
}: {
  day: string;
  rows: RegisterRow[];
  sub?: DailyRow;
}) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.id} className="border-t border-slate-100">
          <td className="p-2.5 text-slate-500">{day}</td>
          <td className="p-2.5 font-medium">{r.receiptNumber}</td>
          <td className="p-2.5">{r.customerName}</td>
          <td className="p-2.5 text-slate-500">{r.source}{r.businessCategory && <span className="block text-xs">Category: {r.businessCategory}</span>}</td>
          <td className="p-2.5 text-right">{r.qtyDisplay}</td>
          <td className="p-2.5 text-right">{peso(r.grossSales)}</td>
          <td className="p-2.5 text-right">{peso(r.discounts)}</td>
          <td className="p-2.5 text-right font-medium">{peso(r.totalAmount)}</td>
          <td className="p-2.5 text-right text-slate-600">{peso(r.paidAmount)}</td>
          <td
            className={`p-2.5 text-right ${
              r.balance > 0 ? "text-rose-600 font-semibold" : "text-slate-400"
            }`}
          >
            {peso(r.balance)}
          </td>
          <td className="p-2.5 text-xs">{r.status}</td>
        </tr>
      ))}
      {sub && (
        <tr className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
          <td className="p-2" colSpan={4}>
            Subtotal {day} ({sub.count})
          </td>
          <td className="p-2 text-right">{sub.qtyDisplay}</td>
          <td className="p-2 text-right">{peso(sub.grossSales)}</td>
          <td className="p-2 text-right">{peso(sub.discounts)}</td>
          <td className="p-2 text-right">{peso(sub.total)}</td>
          <td className="p-2 text-right">{peso(sub.paid)}</td>
          <td className="p-2 text-right">{peso(sub.balance)}</td>
          <td />
        </tr>
      )}
    </>
  );
}

function SummaryTable({ title, rows }: { title: string; rows: Agg[] }) {
  if (rows.length === 0) return <Empty>No data in this period.</Empty>;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const gross = rows.reduce((s, r) => s + r.grossSales, 0);
  const discounts = rows.reduce((s, r) => s + r.discounts, 0);
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="p-2.5 font-semibold">{title}</th>
            <th className="p-2.5 text-right font-semibold">Lines</th>
            <th className="p-2.5 text-right font-semibold">Sold Qty</th>
            <th className="p-2.5 text-right font-semibold">Gross Sales</th>
            <th className="p-2.5 text-right font-semibold">Discounts</th>
            <th className="p-2.5 text-right font-semibold">Net Sales</th>
            <th className="p-2.5 text-right font-semibold">% of Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-slate-100">
              <td className="p-2.5 font-medium">{r.name}</td>
              <td className="p-2.5 text-right text-slate-500">{r.count}</td>
              <td className="p-2.5 text-right">
                {qtyFmt(r.qty)} {r.unit}
              </td>
              <td className="p-2.5 text-right">{peso(r.grossSales)}</td>
              <td className="p-2.5 text-right">{peso(r.discounts)}</td>
              <td className="p-2.5 text-right font-medium">{peso(r.total)}</td>
              <td className="p-2.5 text-right text-slate-500">
                {total > 0 ? ((r.total / total) * 100).toFixed(1) : "0.0"}%
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold">
          <tr>
            <td className="p-2.5">GRAND TOTAL</td>
            <td />
            <td className="p-2.5 text-right text-slate-500">Mixed units</td>
            <td className="p-2.5 text-right">{peso(gross)}</td>
            <td className="p-2.5 text-right">{peso(discounts)}</td>
            <td className="p-2.5 text-right">{peso(total)}</td>
            <td className="p-2.5 text-right">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
      {children}
    </div>
  );
}

function DiscountSummaryTable({ rows, total }: { rows: SalesReport["discountSummary"]; total: number }) {
  return <section className="space-y-3">
    <p className="text-sm text-slate-600">Sales discounts reduce gross sales to net sales. These amounts are already deducted from sales totals and are excluded from operating expenses.</p>
    <div className="overflow-auto rounded-2xl border border-slate-200"><table className="w-full text-sm">
      <thead className="bg-slate-50"><tr><th className="p-3 text-left">Discount</th><th className="p-3 text-right">Product Rows</th><th className="p-3 text-right">Discount Given</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.name} className="border-t"><td className="p-3">{row.name}</td><td className="p-3 text-right">{row.lines}</td><td className="p-3 text-right">{peso(row.amount)}</td></tr>)}{!rows.length && <tr><td colSpan={3} className="p-8 text-center text-slate-500">No sales discounts in this period.</td></tr>}</tbody>
      <tfoot className="border-t-2 bg-slate-100 font-bold"><tr><td className="p-3">TOTAL SALES DISCOUNTS</td><td className="p-3 text-right">{rows.reduce((sum, row) => sum + row.lines, 0)}</td><td className="p-3 text-right">{peso(total)}</td></tr></tfoot>
    </table></div>
  </section>;
}
