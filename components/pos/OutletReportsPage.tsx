"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TablePagination } from "@/components/erp/TablePagination";
import { paginateTable } from "@/lib/table-pagination";
import { manilaDateString } from "@/lib/date-utils";
import { readApiResponse } from "@/lib/api-response";

type Row = Record<string, string | number>;
type Tab = "sales" | "cash" | "expenses" | "profit" | "production";
type Column = { key: string; label: string; money?: boolean; total?: boolean };
const tabs: Record<Tab, string> = { sales: "Daily Sales", cash: "Cash Collections", expenses: "Expenses", profit: "Profit & Loss", production: "Production Cost" };
const columns: Record<Tab, Column[]> = {
  sales: [{ key: "date", label: "Date" }, { key: "receipt", label: "Receipt" }, { key: "products", label: "Products" }, { key: "qty", label: "Qty", total: true }, { key: "sales", label: "Sales", money: true, total: true }, { key: "cogs", label: "COGS", money: true, total: true }, { key: "grossProfit", label: "Gross Profit", money: true, total: true }, { key: "payment", label: "Payment" }],
  cash: [{ key: "date", label: "Date" }, { key: "reference", label: "Reference" }, { key: "description", label: "Transaction" }, { key: "cashIn", label: "Cash In", money: true, total: true }, { key: "cashOut", label: "Cash Out", money: true, total: true }],
  expenses: [{ key: "date", label: "Date" }, { key: "description", label: "Description" }, { key: "type", label: "Expense Type" }, { key: "origin", label: "Origin" }, { key: "amount", label: "Expense", money: true, total: true }, { key: "cash", label: "Cash Deduction", money: true, total: true }],
  profit: [{ key: "description", label: "Account" }, { key: "amount", label: "Amount", money: true }],
  production: [{ key: "date", label: "Date" }, { key: "batch", label: "Batch" }, { key: "product", label: "Output Product" }, { key: "qty", label: "Output Qty", total: true }, { key: "unitCost", label: "Cost / Unit", money: true }, { key: "cost", label: "Capitalized Batch Cost", money: true, total: true }],
};
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export function OutletReportsPage({ outletId, outletName }: { outletId: string; outletName: string }) {
  const today = manilaDateString();
  const [from, setFrom] = useState(today), [to, setTo] = useState(today);
  const [range, setRange] = useState({ from: today, to: today }), [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState<Tab>("sales"), [query, setQuery] = useState("");
  const [data, setData] = useState<Partial<Record<Tab, Row[]>>>({}), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [page, setPage] = useState(1), [size, setSize] = useState(25);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/pos/reports?${new URLSearchParams({ outletId, ...range })}`, { signal: controller.signal, cache: "no-store" });
        const payload = await readApiResponse<Partial<Record<Tab, Row[]>> & { success: boolean; message?: string }>(response);
        if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load reports.");
        if (!controller.signal.aborted) { setData(payload); setPage(1); }
      } catch (e) { if (!controller.signal.aborted) { setData({}); setError(e instanceof Error ? e.message : "Unable to load reports."); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [outletId, range, refresh]);
  const rows = (data[tab] || []).filter(row => !query || Object.values(row).some(value => String(value).toLowerCase().includes(query.toLowerCase())));
  const pagination = paginateTable(rows, page, size);
  function value(row: Row, column: Column) { return column.key === "date" ? new Date(row.date).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "short", timeStyle: "short" }) : column.money ? money.format(Number(row[column.key] || 0)) : row[column.key]; }
  const cashNet = rows.reduce((sum, row) => sum + Number(row.cashIn || 0) - Number(row.cashOut || 0), 0);
  return <section className="pos-outlet-report overflow-hidden rounded-lg border bg-white print:border-0">
    <div className="hidden border-b pb-4 text-center print:block">
      <p className="text-lg font-bold">ISAY FRIED CHICKEN</p>
      <p className="font-semibold">{outletName}</p>
      <p>{tabs[tab]} Report</p>
      <p className="text-sm">Period: {range.from} – {range.to}</p>
      {query && <p className="text-sm">Search: {query}</p>}
    </div>
    <nav className="flex flex-wrap items-center gap-2 border-b p-4 print:hidden">{Object.entries(tabs).map(([key, label]) => <Button key={key} variant={tab === key ? "default" : "outline"} onClick={() => { setTab(key as Tab); setQuery(""); setPage(1); }}>{label}</Button>)}<Button type="button" className="ml-auto" variant="outline" disabled={loading || !!error} onClick={() => window.print()}>Print Report</Button></nav>
    <form className="flex flex-wrap items-end gap-3 border-b p-4 print:hidden" onSubmit={event => { event.preventDefault(); if (from && to && from <= to) { setRange({ from, to }); setRefresh(value => value + 1); } }}>
      <label>Date From<Input required type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>Date To<Input required type="date" min={from} value={to} onChange={event => setTo(event.target.value)} /></label><Button disabled={loading}>Apply</Button><Input className="max-w-sm" placeholder="Search report" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />
    </form>
    <div className="border-b px-5 py-3"><h3 className="font-semibold">{tabs[tab]} Report · {range.from} – {range.to}</h3>{tab === "cash" && <p className="text-sm text-slate-500">Cash movement, not profit. Excludes opening float, remittances and non-cash payments.</p>}{tab === "production" && <p className="text-sm text-slate-500">Historical output cost; selling and operating supplies are reported under Expenses, not added again to inventory cost.</p>}</div>
    {error && <p role="alert" className="p-4 text-red-700">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr>{columns[tab].map(column => <th key={column.key} className={`p-3 ${column.money ? "text-right" : "text-left"}`}>{column.label}</th>)}</tr></thead><tbody>{!loading && !error && rows.map((row, index) => <tr key={row.id} className={`border-t ${index < pagination.from - 1 || index >= pagination.to ? "hidden print:table-row" : ""} ${row.id === "net" || row.id === "gross" ? "font-semibold" : ""}`}>{columns[tab].map(column => <td key={column.key} className={`p-3 ${column.money ? "text-right tabular-nums" : "text-left"}`}>{value(row, column)}</td>)}</tr>)}{(loading || error || !rows.length) && <tr><td colSpan={columns[tab].length} className="p-8 text-center">{loading ? "Loading reports…" : error ? "Report unavailable." : "No records for this period."}</td></tr>}</tbody>{!loading && !error && tab !== "profit" && <tfoot className="border-t bg-slate-100 font-semibold"><tr>{columns[tab].map((column, index) => <td key={column.key} className={`p-3 ${column.money ? "text-right" : "text-left"}`}>{index === 0 ? `Filtered Total (${rows.length})` : column.total ? column.money ? money.format(rows.reduce((sum, row) => sum + Number(row[column.key] || 0), 0)) : rows.reduce((sum, row) => sum + Number(row[column.key] || 0), 0) : ""}</td>)}</tr></tfoot>}</table></div>
    {tab === "cash" && !loading && !error && <p className="border-t p-4 text-right font-semibold">Net Cash Movement: {money.format(cashNet)}</p>}
    <div className="print:hidden"><TablePagination {...pagination} disabled={loading} onPageChange={setPage} onPageSizeChange={value => { setSize(value); setPage(1); }} /></div>
  </section>;
}
