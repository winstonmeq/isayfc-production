"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EntryDialogContent } from "@/components/erp/EntryForm";
import { TablePagination } from "@/components/erp/TablePagination";
import { manilaDateString } from "@/lib/date-utils";
import { readApiResponse } from "@/lib/api-response";

type Ingredient = { id: string; type: "BODEGA" | "GROCERY"; name: string; unit: string; whole: boolean; quantity: number; kilos: number };
type Draft = { key: string; quantity: string; kilos: string };
type Batch = { _id: string; status: string; batchNumber: string; productionDate: string; outputName: string; outputKilos: number; totalCost: number; costPerKilo: number; remarks?: string; createdBy?: { name: string }; allocatedExpenses?: { name: string; amount: number }[]; ingredients: { inventoryType: string; productName: string; quantity: number; kilos: number; unit: string; unitCost: number; cost: number }[] };
type Payload = { success: boolean; message?: string; batches: Batch[]; pagination: { page: number; pageSize: number; totalPages: number; total: number; from: number; to: number }; totals: { kilos: number; cost: number }; ingredients: Ingredient[]; outputs: { id: string; name: string }[]; expenses: { _id: string; name: string; amount: number; expenseDate: string }[] };
const money = (n: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

export function MainProductionPage() {
  const { data: session } = useSession();
  const canManage = session?.user.role === "ADMIN" || session?.user.permissions?.includes("slicing.manage");
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false), [detail, setDetail] = useState<Batch | null>(null);
  const [rows, setRows] = useState<Draft[]>([]);
  const [search, setSearch] = useState(""), [ingredientSearch, setIngredientSearch] = useState("");
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [output, setOutput] = useState(""), [kilos, setKilos] = useState("");
  const [date, setDate] = useState(manilaDateString()), [remarks, setRemarks] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [expenseIds, setExpenseIds] = useState<string[]>([]);
  const [reversing, setReversing] = useState<Batch | null>(null), [reverseReason, setReverseReason] = useState("");
  const [page, setPage] = useState(1), [size, setSize] = useState(25);
  const [status, setStatus] = useState("ALL");
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/main-production?${new URLSearchParams({ search, from, to, status, page: String(page), size: String(size) })}`, { cache: "no-store" });
      const result = await readApiResponse<Payload>(response);
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load production.");
      if (sequence === loadSequence.current) setData(result);
    } catch (error) { if (sequence === loadSequence.current) { setData(null); setMessage(error instanceof Error ? error.message : "Unable to load production."); } }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [search, from, to, status, page, size]);
  useEffect(() => { void load(); }, [load]);
  const pagination = { ...(data?.pagination || { page: 1, pageSize: size, totalPages: 1, total: 0, from: 0, to: 0 }), rows: data?.batches || [] };
  function changeRow(index: number, changes: Partial<Draft>) { setRows(current => current.map((row, i) => i === index ? { ...row, ...changes } : row)); }
  async function save() {
    if (saving) return;
    setSaving(true); setMessage("");
    try {
      const ingredients = rows.map(row => {
        const item = data?.ingredients.find(i => `${i.type}:${i.id}` === row.key);
        if (!item) throw new Error("Select every ingredient.");
        return { type: item.type, id: item.id, quantity: Number(row.quantity), ...(item.whole ? { kilos: Number(row.kilos) } : {}) };
      });
      const response = await fetch("/api/main-production", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestKey, productionDate: date, outputProductId: output, outputKilos: Number(kilos), ingredients, expenseIds, remarks }) });
      const result = await readApiResponse<{ success: boolean; message?: string }>(response);
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to post production.");
      setMessage(result.message || "Production posted."); setOpen(false); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Posting status unknown. Retry the same batch to avoid duplication."); }
    finally { setSaving(false); }
  }
  return <div className="space-y-4 p-4">
    <section className="rounded-lg border bg-white p-4"><div className="flex items-center justify-between gap-3"><h1 className="text-xl font-semibold">Main Production Mixing History</h1>{canManage && <Button onClick={() => { setRows([{ key: "", quantity: "", kilos: "" }]); setOutput(""); setKilos(""); setExpenseIds([]); setRemarks(""); setIngredientSearch(""); setDate(manilaDateString()); setRequestKey(crypto.randomUUID()); setMessage(""); setOpen(true); }}>New Mixing Batch</Button>}</div>
      <div className="mt-4 flex flex-wrap items-end gap-3"><label className="flex-1">Search<Input value={search} placeholder="Batch, output or ingredient" onChange={e => { setSearch(e.target.value); setPage(1); }} /></label><label>Date From<Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label><label>Date To<Input type="date" min={from} value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></label><label>Status<select className="h-10 rounded border px-3" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="ALL">All</option><option value="POSTED">Posted</option><option value="REVERSED">Reversed</option></select></label><Button variant="outline" onClick={() => void load()}>Refresh</Button></div>
    </section>
    {message && !open && <p role="status" className="rounded border bg-white p-3">{message}</p>}
    <section className="overflow-hidden rounded-lg border bg-white"><div className="overflow-x-auto"><table className="w-full text-sm [&_th]:p-3 [&_td]:p-3"><thead className="bg-slate-100 text-left"><tr><th>Date</th><th>Batch</th><th>Finished Product</th><th>Output KG</th><th>Batch Cost</th><th>Cost / KG</th><th>Recorded By</th><th>Status</th><th>Action</th></tr></thead><tbody>{pagination.rows.map(b => <tr key={b._id} className="border-t"><td>{new Date(b.productionDate).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</td><td>{b.batchNumber}</td><td>{b.outputName}</td><td>{b.outputKilos}</td><td>{money(b.totalCost)}</td><td>{money(b.costPerKilo)}</td><td>{b.createdBy?.name || "—"}</td><td>{b.status}</td><td><Button variant="outline" size="sm" onClick={() => setDetail(b)}>Mixing Details</Button>{canManage && b.status !== "REVERSED" && <Button variant="outline" size="sm" className="ml-2" onClick={() => { setReversing(b); setReverseReason(""); setMessage(""); }}>Reverse</Button>}</td></tr>)}{!pagination.rows.length && <tr><td colSpan={9} className="text-center">{loading ? "Loading…" : "No mixing batches match these filters."}</td></tr>}</tbody><tfoot className="border-t bg-slate-100 font-semibold"><tr><td colSpan={3}>Filtered Total ({pagination.total})</td><td>{data?.totals.kilos || 0}</td><td>{money(data?.totals.cost || 0)}</td><td colSpan={4} /></tr></tfoot></table></div><TablePagination disabled={loading} {...pagination} onPageChange={setPage} onPageSizeChange={n => { setSize(n); setPage(1); }} /></section>
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}><EntryDialogContent className="sm:max-w-5xl"><DialogHeader><DialogTitle>New Main Production Batch</DialogTitle></DialogHeader>
      <div className="space-y-4">{message && <p role="alert" className="text-red-700">{message}</p>}<div className="grid gap-4 sm:grid-cols-3"><label>Production Date<Input type="date" max={manilaDateString()} value={date} onChange={e => { setDate(e.target.value); setExpenseIds([]); }} /></label><label>Finished Product (KG)<select className="h-10 w-full rounded border px-2" value={output} onChange={e => setOutput(e.target.value)}><option value="">Select finished product</option>{data?.outputs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Actual Finished Kilos<Input type="number" min="0" step="any" value={kilos} onChange={e => setKilos(e.target.value)} /></label></div>
      {!data?.outputs.length && <p className="text-sm">Create Letson in <Link className="underline" href="/bodega-products">Bodega Products</Link> with unit KG first. Its selling price is per kilo.</p>}
      <Input placeholder="Search ingredients by name" value={ingredientSearch} onChange={e => setIngredientSearch(e.target.value)} />
      <div className="overflow-x-auto"><table className="w-full text-left text-sm [&_td]:p-2 [&_th]:p-2"><thead className="bg-slate-100"><tr><th>Chicken / Ingredient</th><th>Available</th><th>Quantity Used</th><th>Actual KG Used</th><th>Action</th></tr></thead><tbody>{rows.map((row, index) => {
        const item = data?.ingredients.find(i => `${i.type}:${i.id}` === row.key);
        return <tr key={index} className="border-b"><td><select aria-label={`Ingredient ${index + 1}`} className="h-10 w-full min-w-48 rounded border px-2" value={row.key} onChange={e => changeRow(index, { key: e.target.value, quantity: "", kilos: "" })}><option value="">Select ingredient</option>{data?.ingredients.filter(i => `${i.type}:${i.id}` === row.key || (i.id !== output && i.name.toLowerCase().includes(ingredientSearch.toLowerCase()))).map(i => <option key={`${i.type}:${i.id}`} value={`${i.type}:${i.id}`}>{i.name} — {i.type}</option>)}</select></td><td>{item ? `${item.quantity} ${item.whole ? "HEAD" : item.unit}${item.whole ? ` / ${item.kilos} KG` : ""}` : "—"}</td><td><Input aria-label="Quantity used" type="number" min="0" step={item?.whole || item?.unit === "PCS" ? "1" : "any"} value={row.quantity} onChange={e => changeRow(index, { quantity: e.target.value })} /></td><td>{item?.whole ? <Input aria-label="Chicken kilos used" type="number" min="0" step="any" value={row.kilos} onChange={e => changeRow(index, { kilos: e.target.value })} /> : "—"}</td><td><Button variant="outline" onClick={() => setRows(current => current.filter((_, i) => i !== index))}>Remove</Button></td></tr>;
      })}</tbody></table></div><Button variant="outline" onClick={() => setRows(current => [...current, { key: "", quantity: "", kilos: "" }])}>Add Ingredient</Button>
      {!!data?.expenses?.length && <fieldset className="space-y-2 rounded border p-3"><legend>Allocate Recorded Production Costs</legend><p className="text-sm text-slate-500">Select only direct labor/production overhead for this batch, recorded on this production date. Selected costs move from operating expenses into inventory cost—no new payment. Do not select ingredient costs already included above.</p><div className="max-h-40 overflow-y-auto">{data.expenses.filter(e => new Date(e.expenseDate).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) === date).map(e => <label key={e._id} className="flex items-center gap-2 py-1"><input type="checkbox" checked={expenseIds.includes(e._id)} onChange={event => setExpenseIds(ids => event.target.checked ? [...ids, e._id] : ids.filter(id => id !== e._id))} />{e.name} — {money(e.amount)}</label>)}</div></fieldset>}
      <label className="block">Remarks<Input value={remarks} maxLength={1000} onChange={e => setRemarks(e.target.value)} /></label><p className="text-sm text-slate-500">Use stock units shown above. No automatic bag-to-kg conversion. Posting deducts inputs and capitalizes their cost into finished stock; it does not record a cash payment.</p></div>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving || !output || Number(kilos) <= 0 || !rows.length || rows.some(r => !r.key || Number(r.quantity) <= 0)} onClick={() => void save()}>{saving ? "Posting…" : "Post Production"}</Button></DialogFooter>
    </EntryDialogContent></Dialog>
    <Dialog open={!!detail} onOpenChange={value => { if (!value) setDetail(null); }}><EntryDialogContent className="sm:max-w-4xl"><DialogHeader><DialogTitle>Mixing Details — {detail?.batchNumber}</DialogTitle></DialogHeader>{detail && <div className="space-y-4"><p>{detail.status} · {new Date(detail.productionDate).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })} · {detail.createdBy?.name || "Unknown"}</p><p>{detail.outputName}: {detail.outputKilos} KG · {money(detail.totalCost)} total · {money(detail.costPerKilo)}/KG</p><div className="overflow-x-auto"><table className="w-full text-sm [&_td]:p-2 [&_th]:p-2"><thead><tr><th>Source</th><th>Input</th><th>Quantity</th><th>Kilos</th><th>Cost / Unit</th><th>Cost</th></tr></thead><tbody>{detail.ingredients.map((i,index) => <tr key={index} className="border-t"><td>{i.inventoryType}</td><td>{i.productName}</td><td>{i.quantity} {i.unit}</td><td>{i.kilos || "—"}</td><td>{money(i.unitCost)}{i.unit === "HEAD" ? "/KG" : `/${i.unit}`}</td><td>{money(i.cost)}</td></tr>)}</tbody><tfoot className="border-t font-semibold"><tr><td colSpan={5}>Ingredients Total</td><td>{money(detail.ingredients.reduce((sum, i) => sum + i.cost, 0))}</td></tr></tfoot></table></div>{detail.allocatedExpenses?.map((e,i) => <p key={i}>{e.name}: {money(e.amount)} allocated</p>)}<p>{detail.remarks}</p></div>}<DialogFooter><Button variant="outline" onClick={() => setDetail(null)}>Close</Button></DialogFooter></EntryDialogContent></Dialog>
    <Dialog open={!!reversing} onOpenChange={value => { if (!saving && !value) setReversing(null); }}><EntryDialogContent><DialogHeader><DialogTitle>Reverse {reversing?.batchNumber}</DialogTitle></DialogHeader><p>Inputs will be restored and finished output removed. Reversal is blocked if finished stock has subsequent movements.</p><Input placeholder="Reversal reason" minLength={5} value={reverseReason} onChange={e => setReverseReason(e.target.value)} />{message && <p role="alert">{message}</p>}<DialogFooter><Button variant="outline" disabled={saving} onClick={() => setReversing(null)}>Cancel</Button><Button disabled={saving || reverseReason.trim().length < 5} onClick={async () => { if (!reversing || saving) return; setSaving(true); try { const response = await fetch(`/api/main-production/${reversing._id}/reverse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reverseReason }) }); const json = await readApiResponse<{ success: boolean; message: string }>(response); if (!response.ok || !json.success) throw new Error(json.message); setMessage(json.message); setReversing(null); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reverse batch."); } finally { setSaving(false); } }}>Confirm Reversal</Button></DialogFooter></EntryDialogContent></Dialog>
  </div>;
}
