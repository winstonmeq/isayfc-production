"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, RefreshCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TablePagination } from "@/components/erp/TablePagination";
import { paginateTable, DEFAULT_TABLE_PAGE_SIZE } from "@/lib/table-pagination";
import { readApiResponse } from "@/lib/api-response";
import { outletMenuMutation } from "@/lib/outlet-menu-mutation";

type CatalogItem = { id: string; name: string; category: string; defaultPrice: number; assigned: boolean };
type MenuItem = { id: string; name: string; category: string; price: number; isAvailable: boolean };
type Row = { id: string; name: string; category: string; price: number; isAvailable: boolean };
type Panel = { action: "CREATE" } | { action: "ASSIGN" | "UPDATE" | "REMOVE"; item: Row };
type Props = { outletId: string; outletName: string; onClose: () => void; onUpdated: (removedId?: string) => Promise<void> };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function OutletMenuDialog({ outletId, outletName, onClose, onUpdated }: Props) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]), [assigned, setAssigned] = useState<MenuItem[]>([]);
  const [tab, setTab] = useState<"OUTLET" | "CATALOG">("OUTLET");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [canManage, setCanManage] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [name, setName] = useState(""), [category, setCategory] = useState(""), [price, setPrice] = useState("");
  const [available, setAvailable] = useState(true);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const pending = useRef(false), viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    async function load() {
      try {
        const response = await fetch(`/api/pos/menu?outletId=${encodeURIComponent(outletId)}`, { signal: controller.signal, cache: "no-store" });
        const payload = await readApiResponse<{ success: boolean; message?: string; canManage?: boolean; catalog: CatalogItem[]; assigned: MenuItem[] }>(response);
        if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load menu setup.");
        if (!controller.signal.aborted) { setCatalog(payload.catalog || []); setAssigned(payload.assigned || []); setCanManage(payload.canManage === true); }
      } catch (error) {
        if (!controller.signal.aborted) { setCatalog([]); setAssigned([]); setNotice({ error: true, text: error instanceof Error ? error.message : "Unable to load menu." }); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [outletId, refresh]);
  const source: Row[] = tab === "OUTLET" ? assigned : catalog.filter(item => !item.assigned).map(item => ({ ...item, price: item.defaultPrice, isAvailable: true }));
  const search = query.trim().toLowerCase();
  const rows = source.filter(item => `${item.name} ${item.category}`.toLowerCase().includes(search));
  const pagination = paginateTable(rows, page, pageSize);
  function open(next: Panel) {
    setPanel(next); setNotice(null);
    setName(next.action === "CREATE" ? "" : next.item.name);
    setCategory(next.action === "CREATE" ? "" : next.item.category);
    setPrice(next.action === "CREATE" ? "" : String(next.item.price));
    setAvailable(next.action === "CREATE" ? true : next.item.isAvailable);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!panel || pending.current || !canManage) return;
    if (panel.action !== "REMOVE" && (!price.trim() || !Number.isFinite(Number(price)) || Number(price) < 0)) { setNotice({ error: true, text: "Enter a valid selling price." }); return; }
    pending.current = true; setBusy(true); setNotice(null);
    try {
      const mutation = panel.action === "CREATE"
        ? { method: "POST", body: { action: "CREATE", outletId, name: name.trim(), category: category.trim() || "Others", price: Number(price) } }
        : outletMenuMutation(panel.action, outletId, panel.item.id, Number(price), available);
      const response = await fetch("/api/pos/menu", { method: mutation.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(mutation.body) });
      const payload = await readApiResponse<{ success: boolean; message?: string }>(response);
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to save menu changes.");
      const removedId = panel.action === "REMOVE" ? panel.item.id : undefined;
      setPanel(null); setRefresh(value => value + 1);
      await onUpdated(removedId); setNotice({ error: false, text: payload.message || "Menu updated." });
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "Unable to save menu changes." }); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className={`flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-lg p-0 ${panel ? "sm:max-w-2xl" : "sm:max-w-6xl"}`}>
      <DialogHeader className="shrink-0 border-b px-5 py-4"><DialogTitle className="text-lg font-semibold">Menu Setup</DialogTitle><DialogDescription>{outletName}</DialogDescription></DialogHeader>
      {notice && <p role={notice.error ? "alert" : "status"} className={`border-b px-5 py-2 text-sm ${notice.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{notice.text}</p>}
      {panel ? <form className="space-y-4 overflow-auto p-5" onSubmit={save}>
        <h3 className="font-semibold">{panel.action === "CREATE" ? "New Menu Product" : panel.action === "ASSIGN" ? "Add to Outlet Menu" : panel.action === "UPDATE" ? "Edit Menu Product" : "Remove from Outlet Menu"}</h3>
        {panel.action === "REMOVE" ? <p className="text-sm">Remove <strong>{panel.item.name}</strong> from {outletName}? The shared catalog and transaction history will remain.</p> : <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="menu-product-name">Product Name</Label><Input id="menu-product-name" value={name} onChange={event => setName(event.target.value)} maxLength={120} required readOnly={panel.action !== "CREATE"} disabled={busy} /></div>
          <div className="space-y-2"><Label htmlFor="menu-product-category">Category</Label><Input id="menu-product-category" value={category} onChange={event => setCategory(event.target.value)} placeholder="Others" maxLength={80} readOnly={panel.action !== "CREATE"} disabled={busy} /></div>
          <div className="space-y-2"><Label htmlFor="menu-product-price">Selling Price</Label><Input id="menu-product-price" type="number" min="0" step="0.01" required value={price} onChange={event => setPrice(event.target.value)} disabled={busy} /></div>
          {panel.action === "UPDATE" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={available} disabled={busy} onChange={event => setAvailable(event.target.checked)} />Available for Sale</label>}
          {panel.action === "CREATE" && <p className="text-xs text-slate-500 sm:col-span-2">Creates a shared catalog product and adds it to this outlet.</p>}
        </div>}
        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" disabled={busy} onClick={() => setPanel(null)}>Cancel</Button><Button type="submit" variant={panel.action === "REMOVE" ? "destructive" : "default"} disabled={busy}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}{panel.action === "REMOVE" ? "Remove" : panel.action === "ASSIGN" ? "Add to Menu" : "Save"}</Button></div>
      </form> : <>
        <nav aria-label="Menu lists" className="flex shrink-0 gap-2 border-b px-5 py-3"><Button size="sm" variant={tab === "OUTLET" ? "default" : "outline"} onClick={() => { setTab("OUTLET"); setPage(1); }}>Outlet Menu ({assigned.length})</Button><Button size="sm" variant={tab === "CATALOG" ? "default" : "outline"} onClick={() => { setTab("CATALOG"); setPage(1); }}>Shared Catalog</Button></nav>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-3"><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><Input className="pl-9" aria-label="Search menu products" placeholder="Search product or category" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><div className="flex gap-2"><Button size="sm" variant="outline" aria-label="Refresh menu" disabled={loading} onClick={() => { setNotice(null); setRefresh(value => value + 1); }}><RefreshCcw className="size-4" /></Button><Button size="sm" disabled={loading || !canManage} onClick={() => open({ action: "CREATE" })}><Plus className="mr-1 size-4" />New Product</Button></div></div>
        <div ref={viewport} className="min-h-0 overflow-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="sticky top-0 bg-slate-100"><tr><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 text-right font-medium">{tab === "OUTLET" ? "Selling Price" : "Default Price"}</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Action</th></tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan={5} className="p-8 text-center"><span role="status">Loading menu products…</span></td></tr> : pagination.rows.map(item => <tr key={item.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3">{item.category}</td><td className="px-4 py-3 text-right tabular-nums">{money.format(item.price)}</td><td className="px-4 py-3">{tab === "CATALOG" ? "Not Added" : item.isAvailable ? "Available" : "Not for Sale"}</td><td className="px-4 py-3"><div className="flex justify-end gap-2">{tab === "OUTLET" ? <><Button size="sm" variant="outline" disabled={!canManage} onClick={() => open({ action: "UPDATE", item })}>Edit</Button><Button size="sm" variant="outline" className="text-red-600" disabled={!canManage} onClick={() => open({ action: "REMOVE", item })}>Remove</Button></> : <Button size="sm" disabled={!canManage} onClick={() => open({ action: "ASSIGN", item })}>Add to Menu</Button>}</div></td></tr>)}{!loading && !pagination.total && <tr><td colSpan={5} className="p-8 text-center text-slate-500">{tab === "OUTLET" ? "No menu products found. Add products from Shared Catalog or create a new product." : "No unassigned catalog products match your search."}</td></tr>}</tbody></table></div>
        <TablePagination {...pagination} disabled={loading} onPageChange={next => { setPage(next); viewport.current?.scrollTo({ top: 0 }); }} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-t px-5 py-4"><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </>}
    </DialogContent>
  </Dialog>;
}
