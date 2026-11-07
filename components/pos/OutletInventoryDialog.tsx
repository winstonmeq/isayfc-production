"use client";

import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/pos/OutletTaskSurface";
import { TablePagination } from "@/components/erp/TablePagination";
import { paginateTable, DEFAULT_TABLE_PAGE_SIZE } from "@/lib/table-pagination";
import { filterOutletInventory, type OutletInventoryTab } from "@/lib/outlet-inventory-view";

type Item = { id: string; productName: string; categoryName: string; productSource: string; stockQty: number; unitLabel: string; packSize: number; buyingPrice: number; stockKind?: "INGREDIENT" | "FINISHED"; sellingPrice?: number | null; menuAvailable?: boolean };
type Props = { outletId: string; outletName: string; items: Item[]; canManage: boolean; onClose: () => void; onUpdated: () => Promise<void>; pageMode?: boolean };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function OutletInventoryDialog({ items, onClose, pageMode = false }: Props) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<OutletInventoryTab>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const tableViewport = useRef<HTMLDivElement>(null);
  const rows = filterOutletInventory(items, tab, query);
  const pagination = paginateTable(rows, page, pageSize);
  return <Dialog open pageMode={pageMode} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-lg p-0 sm:max-w-6xl">
      {!pageMode && <DialogHeader className="border-b px-5 py-4"><DialogTitle className="text-lg font-semibold">Inventory Management</DialogTitle><DialogDescription className="sr-only">Manage outlet inventory.</DialogDescription></DialogHeader>}
        <nav aria-label="Inventory stock type" className="flex flex-wrap gap-2 border-b px-5 py-3">{([["ALL", "All Stock"], ["INGREDIENT", "Ingredients & Supplies"], ["FINISHED", "Finished Products"]] as const).map(([key, label]) => <Button key={key} type="button" variant={tab === key ? "default" : "outline"} aria-pressed={tab === key} onClick={() => { setTab(key); setPage(1); tableViewport.current?.scrollTo({ top: 0 }); }}>{label} ({filterOutletInventory(items, key, "").length})</Button>)}</nav>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3"><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><Input aria-label="Search inventory" className="pl-9" placeholder="Search product, category or source" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><span className="text-sm text-slate-500">{rows.length} items</span></div>
        <div ref={tableViewport} className="min-h-0 overflow-auto"><table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="sticky top-0 bg-slate-100 text-slate-700"><tr>{["Product", "Category", "Type", "Source", "Available Quantity", "Unit Cost", "Selling Price", "Status"].map(label => <th key={label} className={`px-4 py-3 font-medium ${label === "Available Quantity" ? "text-center" : ["Unit Cost", "Selling Price"].includes(label) ? "text-right" : ""}`}>{label}</th>)}</tr></thead>
          <tbody className="divide-y">{pagination.rows.map(item => {
            const finished = item.stockKind === "FINISHED";
            const status = item.stockQty < 0 ? "Stock Shortage" : finished && !item.menuAvailable ? "Not for Sale" : item.stockQty === 0 ? "Out of Stock" : "In Stock";
            return <tr key={item.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium">{item.productName}</td><td className="px-4 py-3">{item.categoryName || "—"}</td><td className="px-4 py-3">{finished ? "Finished Product" : "Ingredient / Supply"}</td><td className="px-4 py-3">{item.productSource}</td><td className="px-4 py-3 text-center tabular-nums">{item.packSize > 0 && item.stockQty >= 0 ? `${Math.floor(item.stockQty / item.packSize)} packs + ${item.stockQty % item.packSize} pcs` : `${item.stockQty} ${item.packSize > 0 ? "pcs" : item.unitLabel.toLowerCase()}`}</td><td className="px-4 py-3 text-right tabular-nums">{money.format(item.buyingPrice)}<span className="block text-xs text-slate-500">per {item.packSize > 0 ? "pack" : item.unitLabel.toLowerCase()}</span></td><td className="px-4 py-3 text-right tabular-nums">{finished && item.sellingPrice != null ? money.format(item.sellingPrice) : "—"}</td><td className={`px-4 py-3 text-sm ${status === "In Stock" ? "text-emerald-700" : "text-amber-700"}`}>{status}</td></tr>;
          })}{!rows.length && <tr><td colSpan={8} className="p-8 text-center text-slate-500">{tab === "FINISHED" ? "No finished inventory found. Menu setup alone does not create stock." : "No inventory items found."}</td></tr>}</tbody>
        </table></div>
        <TablePagination {...pagination} onPageChange={next => { setPage(next); tableViewport.current?.scrollTo({ top: 0 }); }} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
        {!pageMode && <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-t px-5 py-4"><Button type="button" variant="outline" onClick={onClose}>Close</Button></DialogFooter>}
    </DialogContent>
  </Dialog>;
}
