"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErpPage, ErpPageHeader } from "@/components/erp/ErpShell";
import { formatPeso } from "@/lib/utils";
import { manilaDateString } from "@/lib/date-utils";
export function OutletRemittancesPage() {
  const [data, setData] = useState<any>(null), [notice, setNotice] = useState("");
  const [form, setForm] = useState({ outletId: "", date: manilaDateString(), amount: "", reference: "", remarks: "" });
  const [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const request = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => { const controller = new AbortController(); fetch("/api/pos/remittances", { signal: controller.signal, cache: "no-store" }).then(async response => { const json = await response.json(); if (!response.ok) throw new Error(json.message); return json; }).then(setData).catch(error => { if (!controller.signal.aborted) setNotice(error.message); }); return () => controller.abort(); }, [refresh]);
  async function save() {
    if (busy) return; setBusy(true); setNotice(""); const payload = JSON.stringify(form);
    if (request.current?.payload !== payload) request.current = { payload, key: crypto.randomUUID() };
    try { const response = await fetch("/api/pos/remittances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, requestKey: request.current.key }) }); const json = await response.json(); if (!response.ok) throw new Error(json.message); request.current = null; setNotice(json.message); setForm(current => ({ ...current, amount: "", reference: "", remarks: "" })); setRefresh(value => value + 1); } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  return <ErpPage><ErpPageHeader title="Outlet Remittances" description="Record cash actually sent from an outlet to main / owner. This does not settle a customer invoice and is not sales or an operating expense." />
    <form className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); void save(); }}><label>Outlet<select required disabled={busy} className="mt-1 w-full rounded-lg border p-2" value={form.outletId} onChange={event => setForm({ ...form, outletId: event.target.value })}><option value="">Select outlet</option>{data?.outlets.map((outlet: any) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></label><label>Business Date<Input required disabled={busy} type="date" max={manilaDateString()} value={form.date} onChange={event => setForm({ ...form, date: event.target.value })}/></label><label>Amount<Input required disabled={busy} type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })}/></label><label>Transfer Reference<Input required disabled={busy} value={form.reference} onChange={event => setForm({ ...form, reference: event.target.value })}/></label><label>Remarks<Input disabled={busy} value={form.remarks} onChange={event => setForm({ ...form, remarks: event.target.value })}/></label><Button disabled={busy || !data} className="self-end">Record Remittance</Button></form>
    {notice && <p role="status">{notice}</p>}
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-950 text-white"><tr>{["Date", "Outlet", "Reference", "Amount", "Remarks", "Recorded By"].map(label => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>{data?.data.map((row: any) => <tr className="border-t" key={row._id}><td className="p-3">{manilaDateString(new Date(row.businessDate))}</td><td>{row.outletId?.name}</td><td>{row.reference}</td><td>{formatPeso(row.amount)}</td><td>{row.remarks}</td><td>{row.createdBy?.name}</td></tr>)}</tbody></table><p className="p-3 text-xs text-slate-500">Latest 500 remittances. Daily cash summaries shown elsewhere exclude remittances; subtract these transfers separately to reconcile cash left at the outlet.</p></div>
  </ErpPage>;
}
