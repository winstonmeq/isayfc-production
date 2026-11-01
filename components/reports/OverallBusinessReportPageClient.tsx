"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { OverallBusinessReport } from "@/lib/overall-business-report";
import { ReportShell, buildRangeParams, peso, type Preset } from "./ReportShell";
import { OwnerOutletAllocationsTable, type OwnerOutletAllocations } from "./OwnerOutletAllocationsTable";

type Report = OverallBusinessReport & { range: { start: string; end: string }; generatedAt: string; allocations: OwnerOutletAllocations };
const amount = (value: number | null) => value === null ? "Cost review required" : peso(value);
const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" });
const cell = "p-3 text-right whitespace-nowrap";
const head = "p-3 text-right whitespace-nowrap";

export function OverallBusinessReportPageClient() {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    if (preset === "custom" && (!from || !to || from > to)) { setError("Select a valid start and end date."); setData(null); setLoading(false); return; }
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(""); setData(null);
    try {
      const params = buildRangeParams({ preset, from, to });
      const response = await fetch(`/api/reports/overall?${params}`, { cache: "no-store", signal: controller.signal });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || "Unable to load overall report.");
      if (!controller.signal.aborted) setData(json);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load overall report.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [preset, from, to]);
  useEffect(() => { if (preset !== "custom") void load(); }, [preset, load]);
  useEffect(() => () => request.current?.abort(), []);
  const totals = data?.totals;
  return <ReportShell title="Overall Business Report" subtitle="Main branch and all outlets combined. External customer sales and original company costs only."
    generatedAt={data?.generatedAt} periodLabel={data ? `${dateLabel(data.range.start)} – ${dateLabel(new Date(new Date(data.range.end).getTime() - 1).toISOString())}` : undefined}
    preset={preset} from={from} to={to} onPreset={setPreset} onFrom={setFrom} onTo={setTo} onApply={load}>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    {loading && <div className="flex justify-center p-12"><Loader2 className="size-6 animate-spin" /><span className="sr-only">Loading overall report</span></div>}
    {data && totals && <>
      <p className="text-sm text-slate-600">Owner-outlet main sales and automatic delivery expenses are eliminated from combined income. Unsold stock remains inventory. Collections, remittances, and employee reimbursements are not additional sales or operating expenses.</p>
      {totals.missingCostLines > 0 && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-900">{totals.missingCostLines} sold lines or receipts lack original cost snapshots. Final combined COGS and profit are withheld. Known cost so far: {peso(totals.knownCogs)}. Review the flagged transactions below.</p>}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Combined Income Statement</h2>
        <table className="w-full border text-sm"><tbody>
          {([
            ["Main external customer net sales", data.mainSales], ["Outlet retail net sales", data.outletSales],
            ["Gross sales — all external customers", totals.grossSales], ["Less: sales discounts", -totals.discounts],
            ["Net Sales", totals.netSales], ["Less: Cost of Goods Sold — original company cost", totals.cogs === null ? null : -totals.cogs],
            ["Gross Profit", totals.grossProfit], ["Less: Operating Expenses — main and outlets", -totals.operatingExpenses],
            ["OVERALL NET PROFIT", totals.netProfit],
          ] as Array<[string, number | null]>).map(([label, value], index) => <tr key={label} className={`border-t ${index === 8 ? "bg-slate-100 font-black" : index === 4 || index === 6 ? "font-bold" : ""}`}><td className="p-3">{label}</td><td className={cell}>{amount(value)}</td></tr>)}
        </tbody></table>
      </section>
      <section className="space-y-3 print-break">
        <h2 className="text-lg font-bold">Main & Outlet Summary — Original Company Cost Basis</h2>
        <p className="text-sm text-slate-500">These contributions use company cost, so they differ from outlet standalone reports that use marked-up transfer cost. Automatic main delivery expenses are excluded here.</p>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-slate-100"><tr>
          <th className="p-3 text-left">Branch / Outlet</th>{["Transactions", "Gross Sales", "Discounts", "Net Sales", "Company COGS", "Gross Profit", "Expenses", "Net Profit"].map((label) => <th key={label} className={head}>{label}</th>)}
        </tr></thead><tbody>{data.branches.map((branch) => <tr key={branch.id} className="border-t"><td className="p-3">{branch.name}</td><td className={cell}>{branch.transactions}</td>{[branch.grossSales, branch.discounts, branch.netSales, branch.cogs, branch.grossProfit, branch.operatingExpenses, branch.netProfit].map((value, index) => <td key={index} className={cell}>{amount(value)}</td>)}</tr>)}</tbody>
        <tfoot className="border-t-2 bg-slate-100 font-bold"><tr><td className="p-3">TOTAL</td><td className={cell}>{totals.transactions}</td>{[totals.grossSales, totals.discounts, totals.netSales, totals.cogs, totals.grossProfit, totals.operatingExpenses, totals.netProfit].map((value, index) => <td key={index} className={cell}>{amount(value)}</td>)}</tr></tfoot></table></div>
      </section>
      <section className="space-y-3 print-break">
        <h2 className="text-lg font-bold">External Sales Transactions</h2>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-slate-100"><tr>{["Date", "Branch / Outlet", "Receipt", "Customer", "Products", "Gross Sales", "Discounts", "Net Sales", "Company COGS", "Gross Profit"].map((label) => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead>
          <tbody>{data.rows.length ? data.rows.map((row) => <tr key={row.id} className="border-t"><td className="p-3 whitespace-nowrap">{dateLabel(row.date)}</td><td className="p-3">{row.branch}</td><td className="p-3">{row.receiptNumber}</td><td className="p-3">{row.customer}</td><td className="min-w-48 p-3">{row.products || "Missing sale lines"}</td>{[row.grossSales, row.discounts, row.netSales, row.cogs, row.grossProfit].map((value, index) => <td key={index} className={cell}>{amount(value)}</td>)}</tr>) : <tr><td colSpan={10} className="p-6 text-center text-slate-500">No external sales in this period.</td></tr>}</tbody>
          <tfoot className="border-t-2 bg-slate-100 font-bold"><tr><td colSpan={5} className="p-3">TOTAL ({totals.transactions})</td>{[totals.grossSales, totals.discounts, totals.netSales, totals.cogs, totals.grossProfit].map((value, index) => <td key={index} className={cell}>{amount(value)}</td>)}</tr></tfoot>
        </table></div>
      </section>
      <section className="space-y-3 print-break">
        <h2 className="text-lg font-bold">Operating Expenses</h2>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-slate-100"><tr>{["Date", "Branch / Outlet", "Expense", "Type", "Amount"].map((label) => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead>
          <tbody>{data.expenseRows.length ? data.expenseRows.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{dateLabel(row.date)}</td><td className="p-3">{row.branch}</td><td className="p-3">{row.name}</td><td className="p-3">{row.type}</td><td className={cell}>{peso(row.amount)}</td></tr>) : <tr><td colSpan={5} className="p-6 text-center text-slate-500">No operating expenses in this period.</td></tr>}</tbody>
          <tfoot className="border-t-2 bg-slate-100 font-bold"><tr><td colSpan={4} className="p-3">TOTAL EXPENSES</td><td className={cell}>{peso(totals.operatingExpenses)}</td></tr></tfoot>
        </table></div>
      </section>
      <div className="space-y-2"><h2 className="text-lg font-bold">Internal Activity — Reference Only, Excluded Above</h2><OwnerOutletAllocationsTable data={data.allocations} /></div>
    </>}
  </ReportShell>;
}
