"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell, TableFooter } from "@/components/ui/table";
import { manilaDateString } from "@/lib/date-utils";
import { ErpPage, ErpPageHeader } from "@/components/erp/ErpShell";

export function ChickenReconciliationPage() {
  return <ErpPage><ErpPageHeader title="Chicken Reconciliation" /><ChickenReconciliation /></ErpPage>;
}

type Row = { id: string; product: string; opening: number; receivedKilos: number; receivedHeads: number; slicedKilos: number; slicedHeads: number; other: number; closing: number; difference: number; expected: number; actual: number; variance: number; status: string };
const columns = ["Opening kg", "Received kg", "Received heads", "Sliced kg", "Sliced heads", "Other net kg", "Closing kg", "Balance diff. kg", "Expected PCS", "Actual PCS", "Variance PCS"];
const keys = ["opening", "receivedKilos", "receivedHeads", "slicedKilos", "slicedHeads", "other", "closing", "difference", "expected", "actual", "variance"] as const;
const format = (value: number, index: number) => value.toLocaleString(undefined, { minimumFractionDigits: [0, 1, 3, 5, 6, 7].includes(index) ? 2 : 0, maximumFractionDigits: 2 });

export function ChickenReconciliation() {
  const [date, setDate] = useState(() => manilaDateString());
  const [applied, setApplied] = useState(date);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [product, setProduct] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`/api/slicing/reconciliation?date=${applied}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const json = await response.json(); if (!response.ok || !json.success) throw new Error(json.message || "Unable to load reconciliation."); return json; })
      .then(json => setRows(json.data || []))
      .catch(error => { if (!controller.signal.aborted) { setRows([]); setError(error.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied]);
  const visible = rows.filter(row => row.product.toLowerCase().includes(product.toLowerCase()));
  return <section className="space-y-4 rounded-2xl border bg-white p-4">
    <form className="flex flex-wrap items-end gap-3 print:hidden" onSubmit={event => { event.preventDefault(); setApplied(date); }}>
      <label className="space-y-1 text-sm">Business Date<Input required type="date" value={date} max={manilaDateString()} onChange={event => setDate(event.target.value)} /></label>
      <label className="space-y-1 text-sm">Whole Chicken<Input placeholder="Search product" value={product} onChange={event => setProduct(event.target.value)} /></label>
      <Button type="submit" disabled={loading}>Check</Button>
      <Button type="button" variant="outline" disabled={loading || !!error} onClick={() => window.print()}>Print</Button>
      <Button asChild variant="outline"><Link href="/deliveries">Deliveries</Link></Button>
    </form>
    <h2 className="font-bold">Daily Chicken Reconciliation · {applied}</h2>
    <p className="text-sm text-slate-500">Opening + received + other net movements − sliced = closing kilos. Balances are reconstructed from the stock ledger; missing weights require checking. This is not a physical stock count.</p>
    {error ? <p role="alert" className="text-red-600">{error}</p> : loading ? <p role="status">Loading reconciliation…</p> : <div className="overflow-x-auto rounded-xl border"><Table>
      <TableHeader><TableRow><TableHead>Whole Chicken</TableHead>{columns.map(column => <TableHead key={column} className="text-center">{column}</TableHead>)}<TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>{visible.length ? visible.map(row => <TableRow key={row.id}><TableCell className="font-semibold">{row.product}</TableCell>{keys.map((key, index) => <TableCell key={key} className="text-center tabular-nums">{format(row[key], index)}</TableCell>)}<TableCell className={row.status === "Balanced" ? "text-emerald-700" : "text-amber-700"}>{row.status}</TableCell></TableRow>) : <TableRow><TableCell colSpan={13} className="py-8 text-center">No chicken activity or remaining stock for this date.</TableCell></TableRow>}</TableBody>
      {visible.length > 0 && <TableFooter><TableRow><TableCell>Total</TableCell>{keys.map((key, index) => <TableCell key={key} className="text-center tabular-nums">{format(visible.reduce((sum, row) => sum + row[key], 0), index)}</TableCell>)}<TableCell>{visible.some(row => row.status !== "Balanced") ? "Review flagged rows" : "Balanced"}</TableCell></TableRow></TableFooter>}
    </Table></div>}
  </section>;
}
