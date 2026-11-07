"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/pos/OutletTaskSurface";
import { readApiResponse } from "@/lib/api-response";
import { manilaDateString } from "@/lib/date-utils";
import { productUsageLabel } from "@/lib/product-usage";
import { stockConsumptionType } from "@/lib/stock-consumption";
import { TablePagination } from "@/components/erp/TablePagination";
import { paginateTable, DEFAULT_TABLE_PAGE_SIZE } from "@/lib/table-pagination";

type Inventory = { id: string; productName: string; categoryName: string; productSource: string; stockQty: number; unitLabel: string; packSize: number; buyingPrice: number; usage?: string };
type Expense = { id: string; name: string; type: string; amount: number; expenseDate: string; deductFromCashSale: boolean; origin?: string; quantity?: number; unit?: string; unitCost?: number; usage?: string; remarks?: string; updatedAt: string; canEdit: boolean; canVoid: boolean };
type ExpenseType = { code: string; name: string };
type Tab = "CASH" | "BILLS" | "STOCK";
type Props = { outletId: string; outletName: string; inventory: Inventory[]; onClose: () => void; onUpdated: () => Promise<void>; pageMode?: boolean };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const stockExpense = (row: Expense) => row.origin === "STOCK_USAGE" || row.origin === "PRODUCTION_USAGE";

export function OutletExpensesDialog({ outletId, inventory, onClose, onUpdated, pageMode = false }: Props) {
  const today = manilaDateString();
  const [tab, setTab] = useState<Tab>("CASH");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const tableViewport = useRef<HTMLDivElement>(null);
  const [dateFrom, setDateFrom] = useState(today), [dateTo, setDateTo] = useState(today);
  const [rows, setRows] = useState<Expense[]>([]), [types, setTypes] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0), [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [name, setName] = useState(""), [type, setType] = useState("OTHERS"), [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(today), [remarks, setRemarks] = useState("");
  const [inventoryId, setInventoryId] = useState(""), [quantity, setQuantity] = useState("");
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [rowAction, setRowAction] = useState<{ row: Expense; mode: "VIEW" | "VOID" } | null>(null);
  const [reason, setReason] = useState("");
  const request = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setRows([]);
    async function load() {
      try {
        const response = await fetch(`/api/pos/expenses?${new URLSearchParams({ outletId, dateFrom, dateTo })}`, { signal: controller.signal, cache: "no-store" });
        const payload = await readApiResponse<{ success: boolean; message?: string; data: Expense[]; expenseTypes: ExpenseType[]; canManage?: boolean }>(response);
        if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load expenses.");
        if (!controller.signal.aborted) { setRows(payload.data || []); setTypes(payload.expenseTypes || []); setCanManage(payload.canManage === true); }
      } catch (error) {
        if (!controller.signal.aborted) setNotice({ error: true, text: error instanceof Error ? error.message : "Unable to load expenses." });
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [outletId, dateFrom, dateTo, refresh]);
  const filtered = rows.filter(row => tab === "STOCK" ? stockExpense(row) : !stockExpense(row) && (tab === "CASH" ? row.deductFromCashSale !== false : row.deductFromCashSale === false));
  const pagination = paginateTable(filtered, page, pageSize);
  const total = filtered.reduce((sum, row) => sum + row.amount, 0);
  const eligible = inventory.filter(item => item.stockQty > 0 && stockConsumptionType(item.usage));
  const available = eligible.filter(item => `${item.productName} ${item.categoryName}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = eligible.find(item => item.id === inventoryId);
  const unitCost = selected ? selected.packSize > 0 ? selected.buyingPrice / selected.packSize : selected.buyingPrice : 0;
  const usedQty = Number(quantity);
  const cost = Math.round(usedQty * unitCost * 100) / 100;
  const baseUnit = selected?.packSize ? "PCS" : selected?.unitLabel || "QTY";
  function start() { setEditing(null); setRowAction(null); setReason(""); setAdding(true); setNotice(null); setName(""); setAmount(""); setRemarks(""); setInventoryId(""); setQuantity(""); setSearch(""); setExpenseDate(today); }
  function edit(row: Expense) {
    setEditing(row); setRowAction(null); setReason(""); setAdding(true); setNotice(null);
    setName(row.name); setType(row.type); setAmount(String(row.amount)); setRemarks(row.remarks || ""); setExpenseDate(manilaDateString(new Date(row.expenseDate)));
  }
  async function voidExpense(event: React.FormEvent) {
    event.preventDefault(); if (!rowAction || busy) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/pos/expenses/${rowAction.row.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outletId, expectedUpdatedAt: rowAction.row.updatedAt, reason }) });
      const payload = await readApiResponse<{ success: boolean; message?: string }>(response);
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to void expense.");
      setRowAction(null); setRefresh(value => value + 1); await onUpdated(); setNotice({ error: false, text: payload.message || "Expense voided." });
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "Unable to void expense." }); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setNotice(null);
    try {
      const stock = tab === "STOCK";
      const body = stock
        ? { outletId, inventoryId, quantity: usedQty, expenseDate, remarks }
        : { outletId, name, amount: Number(amount), type, expenseDate, remarks, expenseNature: tab === "CASH" ? "CASH_SALE_EXPENSE" : "PERIOD_EXPENSE", deductFromCashSale: tab === "CASH" };
      const signature = JSON.stringify(body);
      if (!request.current || request.current.signature !== signature) request.current = { signature, key: crypto.randomUUID() };
      const response = await fetch(editing ? `/api/pos/expenses/${editing.id}` : stock ? "/api/pos/stock-usage" : "/api/pos/expenses", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: request.current.key, ...(editing ? { expectedUpdatedAt: editing.updatedAt, reason } : {}) }) });
      const payload = await readApiResponse<{ success: boolean; message?: string }>(response);
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to save expense.");
      request.current = null; setEditing(null); setAdding(false); setDateFrom(expenseDate); setDateTo(expenseDate); setRefresh(value => value + 1);
      await onUpdated(); setNotice({ error: false, text: payload.message || "Expense saved." });
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "Unable to save expense." }); }
    finally { setBusy(false); }
  }
  return <Dialog open pageMode={pageMode} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-lg p-0 sm:max-w-6xl">
      {!pageMode && <DialogHeader className="border-b px-5 py-4"><DialogTitle className="text-lg font-semibold">Expense Management</DialogTitle><DialogDescription className="sr-only">Manage outlet expenses.</DialogDescription></DialogHeader>}
      <nav aria-label="Expense type" className="flex gap-2 border-b px-5 py-3">{([["CASH", "Cash"], ["BILLS", "Monthly Bills"], ["STOCK", "Stock Usage"]] as const).map(([key, label]) => <Button type="button" key={key} variant={tab === key ? "default" : "outline"} size="sm" disabled={busy} onClick={() => { setTab(key); setPage(1); setAdding(false); setEditing(null); setRowAction(null); setNotice(null); }}>{label}</Button>)}</nav>
      {notice && <p role={notice.error ? "alert" : "status"} className={`border-b px-5 py-2 text-sm ${notice.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{notice.text}</p>}
      <div ref={tableViewport} className="min-h-0 overflow-auto">
      {rowAction ? <form onSubmit={voidExpense} className="space-y-4 p-5"><h3 className="font-semibold">{rowAction.mode === "VOID" ? "Void Expense" : "Expense Details"}</h3><table className="w-full text-sm"><tbody className="divide-y">{[["Description", rowAction.row.name], ["Date", new Date(rowAction.row.expenseDate).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })], ["Type", types.find(item => item.code === rowAction.row.type)?.name || rowAction.row.type], ["Amount", money.format(rowAction.row.amount)], ["Cash Deduction", money.format(rowAction.row.deductFromCashSale ? rowAction.row.amount : 0)], ["Quantity", rowAction.row.quantity == null ? "—" : `${rowAction.row.quantity} ${rowAction.row.unit || ""}`], ["Remarks", rowAction.row.remarks || "—"]].map(([label, value]) => <tr key={label}><td className="p-2 text-slate-500">{label}</td><td className="p-2 text-right">{value}</td></tr>)}</tbody></table>{rowAction.mode === "VOID" ? <><p className="text-sm text-amber-800">{rowAction.row.origin === "STOCK_USAGE" ? "Voiding removes this expense from profit and restores the consumed stock. History will be retained." : "Voiding removes this expense from active reports and cash deductions. History will be retained."}</p><div className="space-y-2"><Label htmlFor="void-expense-reason">Reason</Label><Input id="void-expense-reason" required minLength={5} maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></div></> : rowAction.row.origin === "PRODUCTION_USAGE" ? <p className="text-sm text-slate-500">Linked to production. Correct the originating batch, not this expense separately.</p> : rowAction.row.origin === "STOCK_USAGE" ? <p className="text-sm text-slate-500">To correct quantity or cost, void this usage and record a replacement.</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setRowAction(null)}>Back to List</Button>{rowAction.mode === "VOID" && <Button variant="destructive" disabled={busy || reason.trim().length < 5}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Confirm Void</Button>}</div></form> : adding ? <form onSubmit={save} className="space-y-4 p-5">
        <div className="flex items-center justify-between"><h3 className="font-semibold">{editing ? "Edit Expense" : tab === "STOCK" ? "Record Stock Usage" : tab === "CASH" ? "New Cash Expense" : "New Monthly Bill"}</h3><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setAdding(false)}>Back to List</Button></div>
        {tab === "STOCK" && <>
          <Input aria-label="Search consumption products" placeholder="Search available products" value={search} disabled={busy} onChange={event => setSearch(event.target.value)} />
          <div className="max-h-56 overflow-auto rounded border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2 font-medium">Product</th><th className="p-2 font-medium">Usage</th><th className="p-2 text-center font-medium">Stock</th><th className="p-2 text-right font-medium">Action</th></tr></thead><tbody className="divide-y">{available.map(item => <tr key={item.id}><td className="p-2">{item.productName}</td><td className="p-2">{productUsageLabel(item.usage)}</td><td className="p-2 text-center">{item.stockQty} {item.packSize > 0 ? "PCS" : item.unitLabel}</td><td className="p-2 text-right"><Button type="button" size="sm" disabled={busy} variant={inventoryId === item.id ? "default" : "outline"} onClick={() => { setInventoryId(item.id); setQuantity(""); }}>{inventoryId === item.id ? "Selected" : "Use"}</Button></td></tr>)}{!available.length && <tr><td colSpan={4} className="p-4 text-center text-slate-500">No available selling or operating supplies. Check product Usage and outlet stock.</td></tr>}</tbody></table></div>
          <p className="text-xs text-slate-500">Production ingredients and overhead belong in Mixing. Do not record the same usage twice.</p>
        </>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="outlet-expense-date">Business Date</Label><Input id="outlet-expense-date" type="date" required max={today} disabled={busy} value={expenseDate} onChange={event => setExpenseDate(event.target.value)} /></div>
          {tab === "STOCK" ? <div className="space-y-2"><Label htmlFor="consumption-quantity">Quantity Used ({baseUnit})</Label><Input id="consumption-quantity" type="number" min="0.001" max={selected?.stockQty} step={baseUnit === "PCS" || baseUnit === "HEAD" ? "1" : "any"} required disabled={busy || !selected} value={quantity} onChange={event => setQuantity(event.target.value)} /></div> : <>
            <div className="space-y-2"><Label htmlFor="outlet-expense-name">Description</Label><Input id="outlet-expense-name" required maxLength={120} disabled={busy} value={name} onChange={event => setName(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="outlet-expense-amount">Amount</Label><Input id="outlet-expense-amount" type="number" min="0.01" step="0.01" required disabled={busy} value={amount} onChange={event => setAmount(event.target.value)} /></div>
            <div className="space-y-2"><Label>Expense Type</Label><Select value={type} onValueChange={setType} disabled={busy}><SelectTrigger aria-label="Expense type"><SelectValue /></SelectTrigger><SelectContent>{types.map(item => <SelectItem key={item.code} value={item.code}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          </>}
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="outlet-expense-remarks">Remarks</Label><Input id="outlet-expense-remarks" maxLength={500} disabled={busy} value={remarks} onChange={event => setRemarks(event.target.value)} /></div>
          {editing && <div className="space-y-2 sm:col-span-2"><Label htmlFor="edit-expense-reason">Correction Reason</Label><Input id="edit-expense-reason" required minLength={5} maxLength={500} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></div>}
        </div>
        {tab === "STOCK" && selected && <table className="w-full border text-sm"><tbody className="divide-y"><tr><td className="p-2">Selected Product / Usage</td><td className="p-2 text-right">{selected.productName} / {productUsageLabel(selected.usage)}</td></tr><tr><td className="p-2">Unit Cost</td><td className="p-2 text-right">{money.format(unitCost)} / {baseUnit}</td></tr><tr><td className="p-2">Stock After Usage</td><td className="p-2 text-right">{selected.stockQty - usedQty} {baseUnit}</td></tr><tr><td className="p-2">Cost of Consumption</td><td className="p-2 text-right font-semibold">{money.format(cost)}</td></tr><tr><td className="p-2">Cash Drawer Deduction</td><td className="p-2 text-right">{money.format(0)}</td></tr></tbody></table>}
        <p className="text-xs text-slate-500">{tab === "CASH" ? "Reduces cash drawer and profit." : tab === "BILLS" ? "Recorded once on the business date. Reduces profit, not outlet cash; do not enter it again under Cash." : "Deducts current inventory and records a non-cash expense. Cost is calculated by the server."}</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setAdding(false)}>Cancel</Button><Button disabled={busy || (tab === "STOCK" && (!selected || usedQty <= 0 || usedQty > selected.stockQty))}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}{tab === "STOCK" ? "Record Consumption" : "Save"}</Button></div>
      </form> : <>
        <div className="flex flex-wrap items-end gap-3 border-b px-5 py-3"><div className="space-y-1"><Label htmlFor="expense-from">Date From</Label><Input id="expense-from" type="date" max={today} value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1); }} /></div><div className="space-y-1"><Label htmlFor="expense-to">Date To</Label><Input id="expense-to" type="date" min={dateFrom} max={today} value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1); }} /></div><Button variant="outline" size="sm" disabled={loading} onClick={() => { setDateFrom(`${today.slice(0, 7)}-01`); setDateTo(today); setPage(1); }}>This Month</Button><Button variant="outline" size="sm" disabled={loading} onClick={() => { setNotice(null); setRefresh(value => value + 1); }}><RefreshCcw className="size-4" /><span className="sr-only">Refresh</span></Button><Button size="sm" className="sm:ml-auto" disabled={loading || !canManage} onClick={start}><Plus className="mr-1 size-4" />{tab === "STOCK" ? "Record Usage" : "Add Expense"}</Button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-3 font-medium">Date</th><th className="p-3 font-medium">{tab === "STOCK" ? "Product" : "Description"}</th><th className="p-3 font-medium">Expense Type</th>{tab === "STOCK" && <><th className="p-3 text-center font-medium">Qty</th><th className="p-3 text-right font-medium">Unit Cost</th></>}<th className="p-3 text-right font-medium">Amount</th><th className="p-3 text-right font-medium">Cash Deduction</th><th className="p-3 text-right font-medium">Action</th></tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan={tab === "STOCK" ? 8 : 6} className="p-8 text-center">Loading expenses…</td></tr> : pagination.rows.map(row => <tr key={row.id}><td className="p-3">{new Date(row.expenseDate).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</td><td className="p-3">{row.name}</td><td className="p-3">{types.find(item => item.code === row.type)?.name || row.type.replaceAll("_", " ")}</td>{tab === "STOCK" && <><td className="p-3 text-center">{row.quantity == null ? "—" : `${row.quantity} ${row.unit || ""}`}</td><td className="p-3 text-right">{row.unitCost == null ? "—" : money.format(row.unitCost)}</td></>}<td className="p-3 text-right tabular-nums">{money.format(row.amount)}</td><td className="p-3 text-right tabular-nums">{money.format(row.deductFromCashSale ? row.amount : 0)}</td><td className="p-3"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => { setRowAction({ row, mode: "VIEW" }); setNotice(null); }}>View</Button>{canManage && row.canEdit && <Button size="sm" variant="outline" onClick={() => edit(row)}>Edit</Button>}{canManage && row.canVoid && <Button size="sm" variant="outline" className="text-red-600" onClick={() => { setRowAction({ row, mode: "VOID" }); setReason(""); setNotice(null); }}>Void</Button>}</div></td></tr>)}{!loading && !filtered.length && <tr><td colSpan={tab === "STOCK" ? 8 : 6} className="p-8 text-center text-slate-500">No expenses found for this period.</td></tr>}</tbody>{!loading && <tfoot className="border-t bg-slate-100 font-semibold"><tr><td className="p-3" colSpan={tab === "STOCK" ? 5 : 3}>Filtered Total ({filtered.length} records, all pages)</td><td className="p-3 text-right">{money.format(total)}</td><td className="p-3 text-right">{money.format(filtered.reduce((sum, row) => sum + (row.deductFromCashSale ? row.amount : 0), 0))}</td><td /></tr></tfoot>}</table></div>
      </>}
      </div>
      {!adding && !rowAction && <TablePagination {...pagination} disabled={loading || busy} onPageChange={next => { setPage(next); tableViewport.current?.scrollTo({ top: 0 }); }} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />}
      {!pageMode && !adding && !rowAction && <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-t px-5 py-4"><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>}
    </DialogContent>
  </Dialog>;
}
