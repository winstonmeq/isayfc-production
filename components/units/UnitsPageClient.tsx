"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
type Unit = { _id: string; code: string; name: string; allowsDecimal: boolean; isSystem: boolean; isActive: boolean };
const empty = { code: "", name: "", allowsDecimal: false };
export function UnitsPageClient() {
  const { data: session } = useSession();
  const manage = session?.user.role === "ADMIN" || session?.user.permissions?.includes("products.manage");
  const [rows, setRows] = useState<Unit[]>([]), [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Unit | null>(null), [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await fetch("/api/units?includeInactive=true", { cache: "no-store" }); const json = await response.json(); if (!response.ok || !json.success) throw new Error(json.message || "Unable to load units"); setRows(json.data); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to load units"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function mutate(id: string | null, method: string, body?: unknown) {
    setBusy(true); setError("");
    try { const response = await fetch(id ? `/api/units/${id}` : "/api/units", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const json = await response.json(); if (!response.ok || !json.success) throw new Error(json.message || "Unable to save unit"); setEditing(null); setForm(empty); toast.success(method === "DELETE" ? "Unit deactivated." : "Unit saved."); await load(); }
    catch (failure) { const text = failure instanceof Error ? failure.message : "Unable to save unit"; setError(text); toast.error(text); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5"><header><h1 className="text-2xl font-bold">Product Units</h1><p className="mt-1 text-sm text-slate-500">Define the unit used for each product. A unit name does not create a conversion: 1 BAG is one bag, not its weight in KG.</p></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {manage && <form className="grid items-end gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[1fr_2fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); void mutate(editing?._id || null, editing ? "PATCH" : "POST", form); }}>
      <label className="text-sm font-medium">Code<Input required maxLength={12} disabled={!!editing || busy} value={form.code} placeholder="e.g. BTL" onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label>
      <label className="text-sm font-medium">Name<Input required maxLength={80} disabled={busy} value={form.name} placeholder="e.g. Bottle" onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label className="text-sm font-medium">Quantity<select className="h-10 w-full rounded-md border px-2" value={String(form.allowsDecimal)} disabled={busy || !!editing?.isSystem} onChange={(event) => setForm({ ...form, allowsDecimal: event.target.value === "true" })}><option value="false">Whole numbers</option><option value="true">Allow decimals</option></select></label>
      <div className="flex gap-2"><Button disabled={busy} type="submit">{editing ? "Update" : "Add Unit"}</Button>{editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(empty); }}>Cancel</Button>}</div>
    </form>}
    <div className="flex flex-wrap items-center gap-3"><Input className="max-w-sm" placeholder="Search unit code or name…" value={search} onChange={(event) => setSearch(event.target.value)} /><Button variant="outline" disabled={loading || busy} onClick={() => void load()}>Refresh</Button></div>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-950 text-white"><tr>{["Code", "Name", "Quantity", "Status", "Action"].map((label) => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>
      {loading ? <tr><td colSpan={5} className="p-8 text-center">Loading…</td></tr> : rows.filter((unit) => `${unit.code} ${unit.name}`.toLowerCase().includes(search.toLowerCase())).map((unit) => <tr key={unit._id} className="border-t"><td className="p-3 font-bold">{unit.code}</td><td className="p-3">{unit.name}{unit.isSystem && <span className="ml-2 text-xs text-slate-500">Standard</span>}</td><td className="p-3">{unit.allowsDecimal ? "Decimals allowed" : "Whole numbers only"}</td><td className="p-3">{unit.isActive ? "Active" : "Inactive"}</td><td className="p-3">{manage && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => { setEditing(unit); setForm({ code: unit.code, name: unit.name, allowsDecimal: unit.allowsDecimal }); }}>Edit</Button>{!unit.isSystem && <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (unit.isActive ? window.confirm(`Deactivate ${unit.code}?`) : true) void mutate(unit._id, unit.isActive ? "DELETE" : "PATCH", unit.isActive ? undefined : { isActive: true }); }}>{unit.isActive ? "Deactivate" : "Reactivate"}</Button>}</div>}</td></tr>)}
    </tbody></table></div><p className="text-xs text-slate-500">Standard or assigned units cannot be removed. Unit codes are permanent so past records retain their meaning.</p>
  </div>;
}
