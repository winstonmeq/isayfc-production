"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EntryDialogContent } from "@/components/erp/EntryForm";
import { ErpPage, ErpPageHeader } from "@/components/erp/ErpShell";
import { formatPeso } from "@/lib/utils";

type Payment = { _id: string; customerName: string; paymentDate: string; referenceNumber: string; amount: number; appliedAmount: number; unappliedAmount: number; remarks: string; createdByName: string; allocations: { saleId: string; receiptNumber: string; amount: number }[] };
export function PaymentHistoryPageClient() {
  const empty = { search: "", customerId: "", group: "ALL", dateFrom: "", dateTo: "" };
  const [filters, setFilters] = useState(empty), [applied, setApplied] = useState(empty);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Payment[]>([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [summary, setSummary] = useState({ amount: 0, appliedAmount: 0, unappliedAmount: 0 });
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [selected, setSelected] = useState<Payment | null>(null);
  useEffect(() => {
    const customerId = new URLSearchParams(window.location.search).get("customerId") || "";
    if (customerId) { setFilters(current => ({ ...current, customerId })); setApplied(current => ({ ...current, customerId })); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const params = new URLSearchParams({ ...applied, page: String(page), limit: "25" });
    fetch(`/api/payments?${params}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const json = await response.json(); if (!response.ok || !json.success) throw new Error(json.message || "Unable to load payments."); return json;
    }).then(json => { setRows(json.data); setMeta(json.meta); setSummary(json.summary); })
      .catch(error => { if (!controller.signal.aborted) { setError(error.message); setRows([]); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied, page]);
  return <ErpPage><ErpPageHeader title="Payment History" />
    <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 print:hidden" onSubmit={event => { event.preventDefault(); setPage(1); setApplied({ ...filters }); }}>
      <div className="space-y-1"><span className="text-sm">Customer Type</span><Select value={filters.group} onValueChange={group => setFilters({ ...filters, group })}><SelectTrigger className="w-52" aria-label="Customer type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All Customers</SelectItem><SelectItem value="SALE">External Customers</SelectItem><SelectItem value="OUTLET">Own Outlets</SelectItem></SelectContent></Select></div>
      <label>Customer<Input placeholder={filters.customerId ? "Selected customer (Reset to show all)" : "Search customer"} value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value, customerId: "" })} /></label>
      <label>Payment Date From<Input type="date" value={filters.dateFrom} onChange={event => setFilters({ ...filters, dateFrom: event.target.value })} /></label>
      <label>Date To<Input type="date" min={filters.dateFrom || undefined} value={filters.dateTo} onChange={event => setFilters({ ...filters, dateTo: event.target.value })} /></label>
      <Button disabled={loading}>Filter</Button><Button type="button" variant="outline" onClick={() => { setFilters(empty); setApplied(empty); setPage(1); }}>Reset</Button><Button type="button" variant="outline" onClick={() => window.print()}>Print</Button>
    </form>
    {error ? <p role="alert" className="text-red-600">{error}</p> : loading ? <p role="status">Loading payments…</p> : <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-950 text-white"><tr>{["Date", "Customer", "Payment Reference", "Related Sale / Receipt", "Amount", "Applied", "Unapplied", "Recorded By", "Action"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row._id} className="border-t"><td className="p-3">{new Date(row.paymentDate).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</td><td>{row.customerName}</td><td>{row.referenceNumber || "—"}</td><td>{row.allocations.map(a => a.receiptNumber || a.saleId).join(", ") || "Unallocated"}</td><td>{formatPeso(row.amount)}</td><td>{formatPeso(row.appliedAmount)}</td><td>{formatPeso(row.unappliedAmount)}</td><td>{row.createdByName || "—"}</td><td><Button size="sm" variant="outline" onClick={() => setSelected(row)}>View</Button></td></tr>)}{!rows.length && <tr><td colSpan={9} className="p-8 text-center">No payment transactions match the filters.</td></tr>}</tbody><tfoot className="border-t bg-slate-100 font-bold"><tr><td colSpan={4} className="p-3">Filtered Total (all matching payments)</td><td>{formatPeso(summary.amount)}</td><td>{formatPeso(summary.appliedAmount)}</td><td>{formatPeso(summary.unappliedAmount)}</td><td colSpan={2}/></tr></tfoot></table></div>}
    <div className="flex items-center justify-between print:hidden"><span>{meta.total} payments · Page {page} of {meta.totalPages}</span><div className="flex gap-2"><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" disabled={loading || page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}><EntryDialogContent><DialogHeader><DialogTitle>Payment Transaction</DialogTitle></DialogHeader>{selected && <div className="space-y-3"><p>{selected.customerName} · {selected.referenceNumber || selected._id}</p><p>Amount: {formatPeso(selected.amount)}</p><p>Applied: {formatPeso(selected.appliedAmount)} · Unapplied: {formatPeso(selected.unappliedAmount)}</p><p>Recorded by: {selected.createdByName || "—"}</p><p>Remarks: {selected.remarks || "—"}</p><h3 className="font-semibold">Sale Allocations</h3>{selected.allocations.map((allocation, index) => <p key={`${allocation.saleId}-${index}`}>{allocation.receiptNumber || allocation.saleId}: {formatPeso(allocation.amount)}</p>)}</div>}<DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Close</Button></DialogFooter></EntryDialogContent></Dialog>
  </ErpPage>;
}
