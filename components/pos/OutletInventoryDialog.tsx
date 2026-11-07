"use client";

import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/pos/OutletTaskSurface";
import { TablePagination } from "@/components/erp/TablePagination";
import { paginateTable, DEFAULT_TABLE_PAGE_SIZE } from "@/lib/table-pagination";

type Item = { id: string; productName: string; categoryName: string; productSource: string; stockQty: number; unitLabel: string; packSize: number; buyingPrice: number };
type Props = { outletId: string; outletName: string; items: Item[]; canManage: boolean; onClose: () => void; onUpdated: () => Promise<void>; pageMode?: boolean };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function OutletInventoryDialog({ items, onClose, pageMode = false }: Props) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const tableViewport = useRef<HTMLDivElement>(null);
  const search = query.trim().toLowerCase();
  const rows = items.filter(item => `${item.productName} ${item.categoryName} ${item.productSource}`.toLowerCase().includes(search));
  const pagination = paginateTable(rows, page, pageSize);
  return <Dialog open pageMode={pageMode} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-lg p-0 sm:max-w-6xl">
      {!pageMode && <DialogHeader className="border-b px-5 py-4"><DialogTitle className="text-lg font-semibold">Inventory Management</DialogTitle><DialogDescription className="sr-only">Manage outlet inventory.</DialogDescription></DialogHeader>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3"><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><Input aria-label="Search inventory" className="pl-9" placeholder="Search product, category or source" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><span className="text-sm text-slate-500">{rows.length} items</span></div>
        <div ref={tableViewport} className="min-h-0 overflow-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="sticky top-0 bg-slate-100 text-slate-700"><tr>{["Product", "Category", "Source", "Stock", "Unit Cost"].map(label => <th key={label} className={`px-4 py-3 font-medium ${label === "Stock" ? "text-center" : label === "Unit Cost" ? "text-right" : ""}`}>{label}</th>)}</tr></thead><tbody className="divide-y">{pagination.rows.map(item => <tr key={item.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium">{item.productName}</td><td className="px-4 py-3">{item.categoryName || "—"}</td><td className="px-4 py-3">{item.productSource}</td><td className="px-4 py-3 text-center tabular-nums">{item.packSize > 0 ? `${Math.floor(item.stockQty / item.packSize)} packs + ${item.stockQty % item.packSize} pcs` : `${item.stockQty} ${item.unitLabel.toLowerCase()}`}</td><td className="px-4 py-3 text-right tabular-nums">{money.format(item.buyingPrice)}</td></tr>)}{!rows.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">No inventory items found.</td></tr>}</tbody></table></div>
        <TablePagination {...pagination} onPageChange={next => { setPage(next); tableViewport.current?.scrollTo({ top: 0 }); }} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
        {!pageMode && <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-t px-5 py-4"><Button type="button" variant="outline" onClick={onClose}>Close</Button></DialogFooter>}
    </DialogContent>
  </Dialog>;
}
