"use client";

import { useCallback, useEffect, useState } from "react";

type Kind = "BODEGA" | "GROCERY" | "OUTLET";
type Option = { _id: string; name: string; quantity: number; unit: string };
type DraftItem = Option & { inventoryType: Kind; countedQty: number };

export function StockControlPage({ mode }: { mode: "count" | "adjustment" }) {
  const [type, setType] = useState<Kind>("BODEGA");
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState("");
  const [qty, setQty] = useState(0);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [reason, setReason] = useState("PHYSICAL COUNT CORRECTION");
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const endpoint = mode === "count" ? "/api/stock-counts" : "/api/inventory-adjustments";

  const loadRows = useCallback(async () => {
    const response = await fetch(endpoint);
    const result = await response.json();
    setRows(result.data || []);
  }, [endpoint]);

  useEffect(() => { void loadRows(); }, [loadRows]);
  useEffect(() => {
    void fetch(`/api/stock-counts/options?type=${type}`).then((response) => response.json()).then((result) => {
      setOptions(result.data || []); setSelected(""); setQty(0);
    });
  }, [type]);

  const current = options.find((option) => option._id === selected);

  function addCountItem() {
    if (!current) return;
    const key = `${type}:${current._id}`;
    setDraftItems((items) => [...items.filter((item) => `${item.inventoryType}:${item._id}` !== key), { ...current, inventoryType: type, countedQty: qty }]);
    setSelected(""); setQty(0);
  }

  async function save() {
    setMessage("");
    const body = mode === "count"
      ? { countDate: new Date().toISOString(), remarks, items: draftItems.map((item) => ({ inventoryType: item.inventoryType, inventoryId: item._id, countedQty: item.countedQty })) }
      : { inventoryType: type, inventoryId: selected, newQty: qty, reason, remarks };
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    setMessage(result.message || (response.ok ? "Saved." : "Unable to save."));
    if (response.ok) { setDraftItems([]); setRemarks(""); setSelected(""); setQty(0); await loadRows(); }
  }

  async function post(id: string) {
    const response = await fetch(`/api/stock-counts/${id}/post`, { method: "POST" });
    const result = await response.json(); setMessage(result.message);
    if (response.ok) await loadRows();
  }

  return <div className="space-y-6 p-6">
    <div><h1 className="text-3xl font-bold">{mode === "count" ? "Stock Count" : "Inventory Adjustments"}</h1><p className="text-slate-500">{mode === "count" ? "Record physical quantities, review variances, then post the count." : "Post an authorized correction with a permanent inventory ledger entry."}</p></div>
    <div className="grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-5">
      <label>Inventory<select className="mt-1 w-full rounded-lg border p-3" value={type} onChange={(event) => setType(event.target.value as Kind)}><option>BODEGA</option><option>GROCERY</option><option>OUTLET</option></select></label>
      <label className="md:col-span-2">Product<select className="mt-1 w-full rounded-lg border p-3" value={selected} onChange={(event) => { setSelected(event.target.value); setQty(options.find((option) => option._id === event.target.value)?.quantity || 0); }}><option value="">Select product</option>{options.map((option) => <option key={option._id} value={option._id}>{option.name} — {option.quantity} {option.unit}</option>)}</select></label>
      <label>{mode === "count" ? "Counted Qty" : "New Qty"}<input className="mt-1 w-full rounded-lg border p-3" type="number" min="0" value={qty} onChange={(event) => setQty(Number(event.target.value))}/></label>
      {mode === "count" ? <button disabled={!selected} onClick={addCountItem} className="self-end rounded-lg border border-slate-900 p-3 disabled:opacity-40">Add to Count</button> : <label>Reason<select className="mt-1 w-full rounded-lg border p-3" value={reason} onChange={(event) => setReason(event.target.value)}><option>PHYSICAL COUNT CORRECTION</option><option>DAMAGED</option><option>MISSING STOCK</option><option>FOUND STOCK</option><option>DATA CORRECTION</option><option>OTHER</option></select></label>}
      <label className="md:col-span-4">Remarks<input className="mt-1 w-full rounded-lg border p-3" value={remarks} onChange={(event) => setRemarks(event.target.value)}/></label>
      <button disabled={mode === "count" ? draftItems.length === 0 : !selected} onClick={save} className="self-end rounded-lg bg-slate-950 p-3 text-white disabled:opacity-40">{mode === "count" ? "Save Draft Count" : "Post Adjustment"}</button>
      {current && <p className="md:col-span-5 text-sm text-slate-500">System quantity: {current.quantity} {current.unit}. Difference: {qty - current.quantity}.</p>}
      {message && <p className="md:col-span-5 font-medium">{message}</p>}
    </div>
    {mode === "count" && draftItems.length > 0 && <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-left"><thead className="bg-slate-100"><tr><th className="p-3">Inventory</th><th>Product</th><th>System</th><th>Counted</th><th>Variance</th><th>Action</th></tr></thead><tbody>{draftItems.map((item) => <tr className="border-t" key={`${item.inventoryType}:${item._id}`}><td className="p-3">{item.inventoryType}</td><td>{item.name}</td><td>{item.quantity} {item.unit}</td><td>{item.countedQty} {item.unit}</td><td>{item.countedQty - item.quantity}</td><td><button className="text-red-600" onClick={() => setDraftItems((items) => items.filter((row) => row !== item))}>Remove</button></td></tr>)}</tbody></table></div>}
    <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-left"><thead className="bg-slate-950 text-white"><tr><th className="p-3">Number</th><th>Date</th><th>Inventory</th><th>Product</th><th>Before</th><th>Count/New</th><th>Variance</th><th>Status/Reason</th><th>Action</th></tr></thead><tbody>{rows.map((row: any) => mode === "count" ? (row.items || []).map((item: any, index: number) => <tr className="border-t" key={`${row._id}-${index}`}><td className="p-3">{row.countNumber}</td><td>{new Date(row.countDate).toLocaleDateString()}</td><td>{item.inventoryType}</td><td>{item.productName}</td><td>{item.systemQty}</td><td>{item.countedQty}</td><td>{item.variance}</td><td>{row.status}</td><td>{row.status === "DRAFT" && index === 0 && <button onClick={() => post(row._id)} className="rounded bg-emerald-600 px-3 py-1 text-white">Post Count</button>}</td></tr>) : <tr className="border-t" key={row._id}><td className="p-3">{row.adjustmentNumber}</td><td>{new Date(row.adjustmentDate).toLocaleDateString()}</td><td>{row.inventoryType}</td><td>{row.productName}</td><td>{row.previousQty}</td><td>{row.newQty}</td><td>{row.adjustedQty}</td><td>{row.reason}</td><td>POSTED</td></tr>)}</tbody></table></div>
  </div>;
}
