"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErpPageHeader } from "@/components/erp/ErpShell";
import { readApiResponse } from "@/lib/api-response";
import { outletWorkspaceHref } from "@/lib/outlet-navigation";
import { manilaDateString } from "@/lib/date-utils";
import { TablePagination } from "@/components/erp/TablePagination";
import { paginateTable } from "@/lib/table-pagination";

type Outlet = { id: string; name: string; code: string; grossSales: number; cogs: number; netSales: number; expenses: number; netProfit: number };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const amountColumns = [{ key: "grossSales", label: "Gross Sales" }, { key: "cogs", label: "COGS" }, { key: "netSales", label: "Net Sales" }, { key: "expenses", label: "Expenses" }, { key: "netProfit", label: "Net Profit" }] as const;
export function OutletDirectoryPageClient() {
  const today = manilaDateString();
  const [from, setFrom] = useState(today), [to, setTo] = useState(today);
  const [range, setRange] = useState({ from: today, to: today });
  const [page, setPage] = useState(1), [size, setSize] = useState(25);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    async function load() {
      try {
        const response = await fetch(`/api/pos?${new URLSearchParams({ view: "outlets", summary: "1", ...range })}`, { cache: "no-store", signal: controller.signal });
        const payload = await readApiResponse<{ success: boolean; message?: string; outlets: Outlet[] }>(response);
        if (!response.ok || !payload.success || !Array.isArray(payload.outlets)) throw new Error(payload.message || "Unable to load outlets.");
        if (!controller.signal.aborted) setOutlets(payload.outlets);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load outlets.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt, range]);
  const search = query.trim().toLowerCase();
  const visible = outlets.filter(outlet => `${outlet.name} ${outlet.code}`.toLowerCase().includes(search));
  const pagination = paginateTable(visible, page, size);
  return <div className="space-y-4">
    <ErpPageHeader title="Outlet Operations" />
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); if (from && to && from <= to) { setRange({ from, to }); setPage(1); setAttempt(value => value + 1); } }}><div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><Input aria-label="Search outlets" className="pl-9" placeholder="Search outlet name or code" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><label className="text-sm">Date From<Input required type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label className="text-sm">Date To<Input required type="date" min={from} value={to} onChange={event => setTo(event.target.value)} /></label><Button disabled={loading}>Apply</Button><Button type="button" variant="outline" disabled={loading} onClick={() => { const monthStart = `${today.slice(0, 7)}-01`; setFrom(monthStart); setTo(today); setRange({ from: monthStart, to: today }); setPage(1); }}>This Month</Button></form>
    {loading ? <div role="status" className="flex items-center gap-2 py-12"><Loader2 className="size-5 animate-spin" />Loading outlets…</div> : error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}<Button variant="outline" className="ml-3" onClick={() => setAttempt(value => value + 1)}>Retry</Button></div> : <section className="overflow-hidden rounded-xl border bg-white">
      <div className="border-b px-4 py-3 font-semibold">Outlets ({visible.length}) <span className="ml-2 text-sm font-normal text-slate-500">{range.from} – {range.to}</span></div>
      <div className="overflow-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-slate-100"><tr><th className="p-4 text-left">Outlet</th>{amountColumns.map(column => <th key={column.key} className="p-4 text-right">{column.label}</th>)}<th className="p-4 text-right">Action</th></tr></thead><tbody className="divide-y">{pagination.rows.map(outlet => <tr key={outlet.id} className="hover:bg-slate-50"><td className="p-4"><Link className="font-semibold hover:underline" href={outletWorkspaceHref(outlet.id)}>{outlet.name}</Link><p className="text-slate-500">{outlet.code}</p></td>{amountColumns.map(column => <td key={column.key} className={`p-4 text-right tabular-nums ${column.key === "netProfit" ? outlet.netProfit < 0 ? "font-semibold text-red-700" : "font-semibold" : ""}`}>{money.format(outlet[column.key])}</td>)}<td className="p-4 text-right"><Button variant="outline" size="sm" asChild><Link href={outletWorkspaceHref(outlet.id)}>Open Operations<ArrowRight className="ml-2 size-4" /></Link></Button></td></tr>)}</tbody><tfoot className="border-t bg-slate-100 font-semibold"><tr><td className="p-4">Filtered Total ({visible.length})</td>{amountColumns.map(column => <td key={column.key} className="p-4 text-right tabular-nums">{money.format(visible.reduce((sum, outlet) => sum + outlet[column.key], 0))}</td>)}<td /></tr></tfoot></table></div>
      <TablePagination {...pagination} onPageChange={setPage} onPageSizeChange={value => { setSize(value); setPage(1); }} />
      {!visible.length && <p className="p-8 text-center text-slate-500">{outlets.length ? "No outlets match your search." : "No active outlets are available for your account. Ask the administrator to check your outlet access."}</p>}
    </section>}
  </div>;
}
