"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { readApiResponse } from "@/lib/api-response";

type Line = { productName: string; quantity: number; unit: string; unitCost: number; cost?: number; remarks?: string };
type Batch = { id: string; batchNumber: string; date: string; outputs: Line[]; inputs?: Line[]; productionCost: number; consumedCost?: number; createdBy: string; channel: string; status: string };
type Result = { success: boolean; message?: string; rows?: Batch[]; batch?: Batch; page: number; total: number; totalPages: number };
const money = (n: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
const date = (value: string) => new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" });

export function OutletMixingHistory({ outletId }: { outletId: string }) {
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [search, setSearch] = useState("");
  const [filter, setFilter] = useState({ from: "", to: "", search: "" });
  const [page, setPage] = useState(1), [limit, setLimit] = useState(25), [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [batchId, setBatchId] = useState(""), [batch, setBatch] = useState<Batch | null>(null), [detailError, setDetailError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setResult(null);
    const params = new URLSearchParams({ outletId, ...filter, page: String(page), limit: String(limit) });
    void fetch(`/api/pos/mixing/history?${params}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await readApiResponse<Result>(response);
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load history.");
      if (!controller.signal.aborted) setResult(data);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [outletId, filter, page, limit, refresh]);
  useEffect(() => {
    setBatch(null); setDetailError("");
    if (!batchId) return;
    const controller = new AbortController();
    void fetch(`/api/pos/mixing/history?${new URLSearchParams({ outletId, batchId })}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await readApiResponse<Result>(response);
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load batch.");
      if (!controller.signal.aborted) setBatch(data.batch || null);
    }).catch(e => { if (!controller.signal.aborted) setDetailError(e.message); });
    return () => controller.abort();
  }, [outletId, batchId]);
  return <section className="overflow-hidden rounded-lg border bg-white">
    <form className="flex flex-wrap items-end gap-3 border-b p-4" onSubmit={e => { e.preventDefault(); setPage(1); setFilter({ from, to, search }); setRefresh(n => n + 1); }}>
      <label className="text-sm">Date From<Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label className="text-sm">Date To<Input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      <label className="min-w-60 flex-1 text-sm">Output Product<Input placeholder="Search output product" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <Button type="submit">Filter / Refresh</Button><Button type="button" variant="outline" onClick={() => { setFrom(""); setTo(""); setSearch(""); setFilter({ from: "", to: "", search: "" }); setPage(1); }}>Reset</Button>
    </form>
    {error && <p role="alert" className="p-4 text-red-700">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr>{["Date", "Batch", "Output Product / Quantity", "Batch Cost", "Cost / Unit", "Recorded By", "Channel", "Status", "Action"].map(x => <th key={x} className="p-3 text-left">{x}</th>)}</tr></thead>
      <tbody>{result?.rows?.map(row => <tr key={row.id} className="border-t"><td className="p-3 whitespace-nowrap">{date(row.date)}</td><td className="p-3 break-all">{row.batchNumber}</td><td className="p-3">{row.outputs.map((line, i) => <div key={i}>{line.productName} — {line.quantity} {line.unit || "QTY"}</div>)}</td><td className="p-3 whitespace-nowrap">{money(row.productionCost)}</td><td className="p-3">{row.outputs.map((line, i) => <div key={i}>{money(line.unitCost)} / {line.unit || "QTY"}</div>)}</td><td className="p-3">{row.createdBy}</td><td className="p-3">{row.channel}</td><td className="p-3">{row.status}</td><td className="p-3"><Button variant="outline" onClick={() => setBatchId(row.id)}>Details</Button></td></tr>)}
      {!result?.rows?.length && <tr><td colSpan={9} className="p-8 text-center text-slate-500">{loading ? "Loading mixing history…" : error ? "History unavailable." : "No mixing batches match these filters."}</td></tr>}</tbody></table></div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm"><label>Rows <select className="rounded border p-2" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>{[25, 50, 100].map(n => <option key={n}>{n}</option>)}</select> · {result?.total || 0} batches</label><div className="flex items-center gap-3"><Button variant="outline" disabled={loading || !result || result.page <= 1} onClick={() => setPage((result?.page || 1) - 1)}>Previous</Button><span>Page {result?.page || 1} of {result?.totalPages || 1}</span><Button variant="outline" disabled={loading || !result || result.page >= result.totalPages} onClick={() => setPage((result?.page || 1) + 1)}>Next</Button></div></div>
    <Dialog open={!!batchId} onOpenChange={open => { if (!open) setBatchId(""); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Mixing Batch Details</DialogTitle></DialogHeader>
      {detailError ? <p role="alert" className="text-red-700">{detailError}</p> : !batch ? <p>Loading batch…</p> : <><p className="break-all text-sm">{batch.batchNumber} · {date(batch.date)} · {batch.createdBy}</p>{(["inputs", "outputs"] as const).map(kind => <div key={kind}><h3 className="mb-2 font-semibold">{kind === "inputs" ? "Ingredients Consumed" : "Finished Output"}</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr>{["Product", "Quantity", "Unit Cost", "Cost"].map(x => <th className="p-2 text-left" key={x}>{x}</th>)}</tr></thead><tbody>{batch[kind]?.map((line, i) => <tr key={i} className="border-b"><td className="p-2">{line.productName}{line.remarks && <p className="text-xs text-slate-500">{line.remarks}</p>}</td><td className="p-2">{line.quantity} {line.unit}</td><td className="p-2">{money(line.unitCost)}</td><td className="p-2">{money(line.cost || 0)}</td></tr>)}</tbody></table></div></div>)}<p>Consumed stock cost: {money(batch.consumedCost || 0)} · Capitalized batch cost: {money(batch.productionCost)}</p><p className="text-xs text-slate-500">Historical ledger costs. Supplies expensed separately may not be included in finished output cost. Legacy allocation details may be unavailable. Posted batches are read-only.</p></>}
      <div className="flex justify-end"><Button variant="outline" onClick={() => setBatchId("")}>Close</Button></div>
    </DialogContent></Dialog>
  </section>;
}
