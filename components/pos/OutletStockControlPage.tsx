"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TablePagination } from "@/components/erp/TablePagination";
import { paginateTable } from "@/lib/table-pagination";
import { readApiResponse } from "@/lib/api-response";

type Item = { id: string; productName: string; stockQty: number; packSize: number; unitLabel: string };
type Row = { _id: string; createdAt: string; productName: string; kind: string; status: string; quantity: number; unit: string; previousStock: number; newStock: number; reason: string };
const kinds = { CORRECTION: "Stock Correction", SPOILAGE: "Spoilage / Waste", CUSTOMER_RETURN: "Customer Return Request", RETURN_TO_MAIN: "Return to Main Request" };
export function OutletStockControlPage({ outletId, embedded = false }: { outletId: string; embedded?: boolean }) {
  const [items, setItems] = useState<Item[]>([]), [rows, setRows] = useState<Row[]>([]);
  const [kind, setKind] = useState<keyof typeof kinds>("CORRECTION"), [inventoryId, setInventoryId] = useState("");
  const [quantity, setQuantity] = useState(""), [reason, setReason] = useState(""), [saleLineId, setSaleLineId] = useState("");
  const [query, setQuery] = useState(""), [page, setPage] = useState(1), [size, setSize] = useState(25);
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [canManage, setCanManage] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const [dateFrom, setDateFrom] = useState(""), [dateTo, setDateTo] = useState("");
  const lock = useRef(false), key = useRef("");
  async function load() {
    const [stockResponse, historyResponse] = await Promise.all([fetch(`/api/pos?outletId=${outletId}`), fetch(`/api/pos/stock-control?outletId=${outletId}`)]);
    const stock = await readApiResponse<{ success: boolean; inventory: Item[]; canManageInventory: boolean; message?: string }>(stockResponse);
    const history = await readApiResponse<{ success: boolean; rows: Row[]; message?: string }>(historyResponse);
    if (!stockResponse.ok || !stock.success || !historyResponse.ok || !history.success) throw new Error(stock.message || history.message || "Unable to load stock control.");
    setItems(stock.inventory); setCanManage(stock.canManageInventory); setRows(history.rows);
  }
  useEffect(() => { void load().catch(error => setNotice(error.message)); }, [outletId]); // eslint-disable-line react-hooks/exhaustive-deps
  const item = items.find(row => row.id === inventoryId);
  const pending = kind === "CUSTOMER_RETURN" || kind === "RETURN_TO_MAIN";
  const filtered = rows.filter(row => {
    const day = new Date(row.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo) && `${row.productName} ${row.kind} ${row.status} ${row.reason}`.toLowerCase().includes(query.toLowerCase());
  });
  const pagination = paginateTable(filtered, page, size);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (lock.current || !item) return;
    lock.current = true; setBusy(true); setNotice("");
    key.current ||= crypto.randomUUID();
    try {
      const response = await fetch("/api/pos/stock-control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outletId, inventoryId, kind, quantity: Number(quantity), expectedStock: item.stockQty, reason, saleLineId: saleLineId || undefined, idempotencyKey: key.current }) });
      const result = await readApiResponse<{ success: boolean; message: string }>(response);
      if (!response.ok || !result.success) throw new Error(result.message);
      key.current = ""; setQuantity(""); setReason(""); await load(); setNotice(result.message);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save."); }
    finally { lock.current = false; setBusy(false); }
  }
  function changed() { key.current = ""; }
  return <div className={embedded ? "space-y-5" : "space-y-5 p-5"}>
    {!embedded && <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Stock Adjustments &amp; Returns</h1><Link href={`/pos/outlets/${outletId}`}>Back to Outlet</Link></div>}
    {notice && <p role="status" className="rounded border bg-slate-50 p-3">{notice}</p>}
    <form onSubmit={save} onChange={changed} className="space-y-4 rounded-lg border bg-white p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <label>Transaction<select disabled={busy} className="mt-1 w-full rounded border p-2" value={kind} onChange={event => setKind(event.target.value as keyof typeof kinds)}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Product<select required disabled={busy} className="mt-1 w-full rounded border p-2" value={inventoryId} onChange={event => setInventoryId(event.target.value)}><option value="">Select product</option>{items.map(row => <option key={row.id} value={row.id}>{row.productName} — {row.stockQty} {row.packSize ? "PCS" : row.unitLabel}</option>)}</select></label>
        <label>{kind === "CORRECTION" ? "New physical quantity" : "Quantity"} ({item?.packSize ? "PCS" : item?.unitLabel || "base units"})<Input required disabled={busy} min={kind === "CORRECTION" ? 0 : 0.000001} step="any" type="number" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
      </div>
      {kind === "CUSTOMER_RETURN" && <label className="block">Original Sale Line ID<Input disabled={busy} required value={saleLineId} onChange={event => setSaleLineId(event.target.value)} /></label>}
      <label className="block">Reason<Input disabled={busy} required minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
      {pending && <p className="text-sm text-amber-800">Review request only. Approval, refunds and main receipt posting are not yet available here. No inventory or money moves when this request is saved.</p>}
      {kind === "SPOILAGE" && <p className="text-sm text-slate-600">Deducts outlet stock and records non-cash spoilage loss. Not for ingredients already consumed in production.</p>}
      <div className="flex justify-end"><Button disabled={busy || !canManage || !item}>{busy ? "Saving…" : pending ? "Submit Request" : "Post Adjustment"}</Button></div>
    </form>
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="flex flex-wrap items-end gap-3 p-4"><label className="min-w-60 flex-1">Search<Input placeholder="Product, transaction or status" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><label>Date From<Input type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1); }} /></label><label>Date To<Input type="date" min={dateFrom} value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1); }} /></label><Button variant="outline" disabled={busy} onClick={() => void load().catch(error => setNotice(error.message))}>Refresh</Button></div>
      <div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr>{["Date", "Product", "Transaction", "Qty", "Before", "After", "Status", "Action"].map(title => <th className="p-3 text-left" key={title}>{title}</th>)}</tr></thead><tbody>{pagination.rows.map(row => <tr className="border-t" key={row._id}><td className="p-3">{new Date(row.createdAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</td><td className="p-3">{row.productName}</td><td className="p-3">{kinds[row.kind as keyof typeof kinds]}</td><td className="p-3">{row.quantity} {row.unit}</td><td className="p-3">{row.previousStock}</td><td className="p-3">{row.newStock}</td><td className="p-3">{row.status.replaceAll("_", " ")}</td><td className="p-3"><Button variant="outline" onClick={() => setDetail(row)}>View</Button></td></tr>)}{!filtered.length && <tr><td colSpan={8} className="p-8 text-center">No stock adjustments or return requests.</td></tr>}</tbody></table></div>
      <TablePagination {...pagination} onPageChange={setPage} onPageSizeChange={value => { setSize(value); setPage(1); }} />
    </div>
    {detail && <section className="rounded border bg-white p-5"><div className="flex justify-between"><h2 className="font-semibold">Transaction {detail._id}</h2><Button variant="outline" onClick={() => setDetail(null)}>Close</Button></div><p className="mt-3">{detail.reason}</p><p className="mt-2 text-sm">Posted records are retained. Spoilage reversals are available through Expense Management → Stock Usage → Void.</p></section>}
  </div>;
}
