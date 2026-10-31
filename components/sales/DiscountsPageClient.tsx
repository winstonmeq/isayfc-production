"use client";

import { EntryActions } from "@/components/erp/EntryForm";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateDiscountRule, type DiscountRule } from "@/lib/discounts";
import { formatPeso } from "@/lib/utils";

type DiscountRow = DiscountRule & { _id: string; isActive: boolean };
const emptyForm = { name: "", type: "PERCENTAGE" as DiscountRule["type"], value: "", basis: "PER_UNIT" as "PER_UNIT" | "PER_ROW" };

export function DiscountsPageClient() {
  const [rows, setRows] = useState<DiscountRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<DiscountRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/discounts?includeInactive=true", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load discounts.");
      setRows(payload.data || []);
    } catch (failure) { setError((failure as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const rule = { name: form.name.trim(), type: form.type, value: Number(form.value), basis: form.basis };
    try { validateDiscountRule(rule); } catch (failure) { toast.error((failure as Error).message); return; }
    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/discounts/${editing._id}` : "/api/discounts", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...rule, isActive: editing?.isActive ?? true }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to save discount.");
      toast.success(payload.message); setForm(emptyForm); setEditing(null); await load();
    } catch (failure) { toast.error((failure as Error).message); }
    finally { setSaving(false); }
  }
  async function toggle(row: DiscountRow) {
    if (row.isActive && !window.confirm(`Disable ${row.name} for future sales?`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/discounts/${row._id}`, {
        method: row.isActive ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...row, isActive: true }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to update discount.");
      toast.success(payload.message); if (editing?._id === row._id) { setEditing(null); setForm(emptyForm); } await load();
    } catch (failure) { toast.error((failure as Error).message); }
    finally { setSaving(false); }
  }
  return <main className="space-y-5">
    <header className="rounded-2xl border bg-white p-6"><h1 className="text-2xl font-bold">Discount Setup</h1><p className="mt-1 text-sm text-slate-500">Configure discounts for individual grocery and bodega products. Per-unit amounts multiply by the quantity in Sales. Per-row amounts deduct once from the product row.</p></header>
    <form onSubmit={save} className="grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-3">
      <label className="text-sm font-semibold">Name<Input required maxLength={100} className="mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label className="text-sm font-semibold">Type<select className="mt-1 h-10 w-full rounded-md border bg-white px-3" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as DiscountRule["type"] })}><option value="PERCENTAGE">Percentage (%)</option><option value="AMOUNT">Fixed Amount (₱)</option></select></label>
      <label className="text-sm font-semibold">{form.type === "PERCENTAGE" ? "Percentage" : "Amount"}<Input required type="number" min="0.01" max={form.type === "PERCENTAGE" ? 100 : undefined} step="0.01" className="mt-1" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} /></label>
      {form.type === "AMOUNT" && <label className="text-sm font-semibold">Calculation Basis<select className="mt-1 h-10 w-full rounded-md border bg-white px-3" value={form.basis} onChange={(event) => setForm({ ...form, basis: event.target.value as "PER_UNIT" | "PER_ROW" })}><option value="PER_UNIT">Per unit sold</option><option value="PER_ROW">Once per product row</option></select><span className="mt-1 block text-xs font-normal text-slate-500">{form.basis === "PER_UNIT" ? `Example: ${formatPeso(Number(form.value) || 0)} × 10 units = ${formatPeso((Number(form.value) || 0) * 10)} discount. Units follow the sale: pieces, packs, or heads.` : "This amount is deducted once, regardless of the quantity."}</span></label>}
      <EntryActions className="md:col-span-3"><Button disabled={saving || loading}>{saving ? "Saving…" : "Save"}</Button>{editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel</Button>}</EntryActions>
    </form>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <div className="overflow-auto rounded-2xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-900 text-white"><tr>{["Name", "Type", "Value", "Calculation Basis", "Status", "Actions"].map((name) => <th key={name} className="p-3 text-left">{name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row._id} className="border-t"><td className="p-3 font-semibold">{row.name}</td><td className="p-3">{row.type === "PERCENTAGE" ? "Percentage" : "Fixed Amount"}</td><td className="p-3">{row.type === "PERCENTAGE" ? `${row.value}%` : formatPeso(row.value)}</td><td className="p-3">{row.type === "PERCENTAGE" ? "Percentage of row" : row.basis === "PER_UNIT" ? "Per unit sold" : "Once per product row"}</td><td className="p-3">{row.isActive ? "Active" : "Disabled"}</td><td className="flex gap-2 p-3"><Button variant="outline" size="sm" disabled={saving} onClick={() => { setEditing(row); setForm({ name: row.name, type: row.type, value: String(row.value), basis: row.basis || "PER_ROW" }); }}>Edit</Button><Button variant="outline" size="sm" disabled={saving} onClick={() => void toggle(row)}>{row.isActive ? "Disable" : "Restore"}</Button></td></tr>)}{!rows.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">{loading ? "Loading…" : "No discounts configured."}</td></tr>}</tbody></table></div>
  </main>;
}
