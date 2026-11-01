"use client";
import { readApiResponse } from "@/lib/api-response";
import { emptyPosDailyReport } from "@/lib/pos-empty-report";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Blend, BookOpen, CheckCircle2, FileText, Loader2, PackageCheck, Plus, Printer, ReceiptText, Search, Store, Trash2, Warehouse, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { manilaDateString } from "@/lib/date-utils";
import { validIngredientQuantity } from "@/lib/business-flow";
import { EmployeeAccounts } from "./EmployeeAccounts";
import { outletMenuMutation } from "@/lib/outlet-menu-mutation";

type Outlet = { id: string; name: string; code: string };
type MenuItem = { id: string; name: string; category: string; price: number; imageUrl: string; stockQty: number; unit: string };
type Shift = { id: string; expectedCash: number; salesCount: number };
type RecentSale = { id: string; receiptNumber: string; totalAmount: number; totalQty: number };
type InventoryItem = { id: string; productName: string; categoryName: string; productSource: string; stockQty: number; unitLabel: string; packSize: number; buyingPrice: number };
type IncomingTransfer = { id: string; transferNumber: string; status: string; transferDate: string; items: Array<{ id: string; productName: string; qty: number; unitLabel: string; packSize: number }> };
type OutletExpense = { id: string; name: string; type: string; amount: number; expenseDate: string; remarks: string };
type ExpenseTypeOption = { code: string; name: string };
type DailyReport = { date: string; revenue: number; cogs: number; expenses: number; grossProfit: number; netProfit: number; cash: { cashSales: number; collections: number; expenses: number; reimbursements: number; netCashMovement: number }; transactions: Array<{ id: string; receiptNumber: string; totalAmount: number; totalQty: number; cogs: number; grossProfit: number; saleDate: string; paymentMethod?: string; employeeName?: string; paidAmount?: number; balance?: number }> };
type Bootstrap = { success: boolean; message?: string; outlets: Outlet[]; outletId: string; menu: MenuItem[]; inventory: InventoryItem[]; shift: Shift | null; recentSales: RecentSale[]; dailyReport: DailyReport };
type CartEntry = MenuItem & { qty: number };
type Receipt = { receiptNumber: string; outletName: string; total: number; cash: number; change: number; items: CartEntry[]; saleDate: string; isLateEntry: boolean; paymentMethod?: string; employeeName?: string };
type CatalogItem = { id: string; name: string; category: string; defaultPrice: number; assigned: boolean };
type AssignedMenuItem = { id: string; catalogItemId: string; name: string; category: string; price: number; isAvailable: boolean };
type MixIngredient = { inventoryId: string; productName: string; quantity: number; available: number; unitLabel: string };

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });

function localDateTimeValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function OutletPosPageClient() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [outletId, setOutletId] = useState("");
  const [query, setQuery] = useState("");
  const [productResultsOpen, setProductResultsOpen] = useState(false);
  const [selectedMenuId, setSelectedMenuId] = useState("");
  const [lineQty, setLineQty] = useState("1");
  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [cashReceived, setCashReceived] = useState("");
  const [entryMode, setEntryMode] = useState<"TRANSACTION" | "DAILY_TOTAL">("TRANSACTION");
  const [saleEntryOpen, setSaleEntryOpen] = useState(false);
  const [employeeAccountsOpen, setEmployeeAccountsOpen] = useState(false);
  const [employees, setEmployees] = useState<Array<{ _id: string; name: string }>>([]);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [saleEmployeeId, setSaleEmployeeId] = useState("");
  const saleRequestKey = useRef("");
  const [lateEntry, setLateEntry] = useState(false);
  const [originalSaleAt, setOriginalSaleAt] = useState(() => localDateTimeValue());
  const [lateEntryReason, setLateEntryReason] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [mixingOpen, setMixingOpen] = useState(false);
  const [menuSetupOpen, setMenuSetupOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [menuSetupLoading, setMenuSetupLoading] = useState(false);
  const [menuSetupQuery, setMenuSetupQuery] = useState("");
  const [newMenuName, setNewMenuName] = useState("");
  const [newMenuCategory, setNewMenuCategory] = useState("Others");
  const [newMenuPrice, setNewMenuPrice] = useState("");
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [assignedMenuItems, setAssignedMenuItems] = useState<AssignedMenuItem[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [incomingOpen, setIncomingOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [deductionOpen, setDeductionOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [incoming, setIncoming] = useState<IncomingTransfer[]>([]);
  const [incomingLoading, setIncomingLoading] = useState(false);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expenses, setExpenses] = useState<OutletExpense[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseTypeOption[]>([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [expenseName, setExpenseName] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => manilaDateString());
  const [expenseType, setExpenseType] = useState("DELIVERY_EXPENSES");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseRemarks, setExpenseRemarks] = useState("");
  const [stockQuery, setStockQuery] = useState("");
  const [deductInventoryId, setDeductInventoryId] = useState("");
  const [deductQty, setDeductQty] = useState("1");
  const [deductUnit, setDeductUnit] = useState("PCS");
  const [deductRemarks, setDeductRemarks] = useState("");
  const [mixSourceId, setMixSourceId] = useState("");
  const [mixMenuId, setMixMenuId] = useState("");
  const [mixSourceQuery, setMixSourceQuery] = useState("");
  const [mixOutputQuery, setMixOutputQuery] = useState("");
  const [mixSourceResultsOpen, setMixSourceResultsOpen] = useState(false);
  const [mixOutputResultsOpen, setMixOutputResultsOpen] = useState(false);
  const [mixSourceQty, setMixSourceQty] = useState("1");
  const [mixIngredients, setMixIngredients] = useState<MixIngredient[]>([]);
  const [mixOutputQty, setMixOutputQty] = useState("1");
  const [mixRemarks, setMixRemarks] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const menuMutationBusy = useRef(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async (selected?: string, preserveCart = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/pos${selected ? `?outletId=${encodeURIComponent(selected)}` : ""}`, { cache: "no-store" });
      const payload = await readApiResponse<Bootstrap>(response);
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load outlet operations.");
      if (!Array.isArray(payload.outlets)) throw new Error("Unable to load the outlet list. Refresh and retry.");
      if (!payload.dailyReport) {
        if (payload.outletId) throw new Error("The outlet report could not be loaded. Refresh and retry.");
        payload.dailyReport = emptyPosDailyReport(new Date().toISOString());
      }
      payload.inventory ??= [];
      payload.menu ??= [];
      setData(payload); setOutletId(payload.outletId);
      if (!preserveCart) setCart({});
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to load outlet operations." });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const loadEmployees = useCallback(async () => {
    if (!outletId) { setEmployees([]); return; }
    try {
      const response = await fetch(`/api/pos/employee-finance?outletId=${encodeURIComponent(outletId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setEmployees(payload.employees || []);
    } catch { /* Cash sales remain available; the server validates credit. */ }
  }, [outletId]);
  useEffect(() => { void loadEmployees(); setSaleEmployeeId(""); }, [loadEmployees]);

  const menu = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (data?.menu || []).filter((x) => !search || `${x.name} ${x.category}`.toLowerCase().includes(search));
  }, [data?.menu, query]);
  const mixingSources = useMemo(() => {
    const search = mixSourceQuery.trim().toLowerCase();
    const selected = new Set(mixIngredients.map((item) => item.inventoryId));
    return (data?.inventory || []).filter((item) => item.stockQty > 0 && !selected.has(item.id) && (!search || `${item.productName} ${item.categoryName} ${item.productSource}`.toLowerCase().includes(search)));
  }, [data?.inventory, mixIngredients, mixSourceQuery]);
  const mixingOutputs = useMemo(() => {
    const search = mixOutputQuery.trim().toLowerCase();
    return (data?.menu || []).filter((item) => !search || `${item.name} ${item.category}`.toLowerCase().includes(search));
  }, [data?.menu, mixOutputQuery]);
  const rows = Object.values(cart);
  const total = rows.reduce((sum, x) => sum + x.price * x.qty, 0);
  const cash = Number(cashReceived || 0);
  const outletName = data?.outlets.find((x) => x.id === outletId)?.name || "Outlet";

  function addSelectedProduct() {
    const item = data?.menu.find((entry) => entry.id === selectedMenuId);
    const quantity = Number(lineQty);
    if (!item) return setNotice({ kind: "error", text: "Select a product." });
    if (!Number.isInteger(quantity) || quantity < 1) return setNotice({ kind: "error", text: "Enter a valid quantity." });
    if (item.stockQty < 1) return setNotice({ kind: "error", text: `${item.name} is out of stock.` });
    setCart((current) => {
      const qty = (current[item.id]?.qty || 0) + quantity;
      return qty > item.stockQty ? current : { ...current, [item.id]: { ...item, qty } };
    });
    if (quantity > item.stockQty) setNotice({ kind: "error", text: `Only ${item.stockQty} ${item.unit} of ${item.name} are available.` });
    else { setSelectedMenuId(""); setLineQty("1"); setQuery(""); }
  }
  function setQty(item: CartEntry, qty: number) {
    setCart((current) => {
      if (qty <= 0) { const next = { ...current }; delete next[item.id]; return next; }
      return { ...current, [item.id]: { ...item, qty: Math.min(qty, item.stockQty) } };
    });
  }
  async function checkout() {
    if (!saleRequestKey.current) saleRequestKey.current = crypto.randomUUID();
    const soldItems = rows.map((x) => ({ ...x }));
    setWorking(true); setNotice(null);
    try {
      const response = await fetch("/api/pos/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outletId, paymentMethod, employeeId: paymentMethod === "CREDIT" ? saleEmployeeId : undefined, idempotencyKey: saleRequestKey.current, cashReceived: cash, remarks: `${entryMode === "DAILY_TOTAL" ? "DAILY TOTALS ENTRY" : "INDIVIDUAL TRANSACTION"}${lateEntry ? `; LATE ENTRY: ${lateEntryReason.trim()}` : ""}`, isLateEntry: lateEntry, originalSaleAt: lateEntry ? new Date(originalSaleAt).toISOString() : undefined, lateEntryReason: lateEntry ? lateEntryReason : undefined, items: soldItems.map((x) => ({ menuItemId: x.id, qty: x.qty })) }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to record sale.");
      setReceipt({ receiptNumber: payload.sale.receiptNumber, outletName, total: payload.sale.totalAmount, cash: paymentMethod === "CREDIT" ? 0 : cash, change: payload.sale.change, items: soldItems, saleDate: payload.sale.saleDate, isLateEntry: payload.sale.isLateEntry, paymentMethod: payload.sale.paymentMethod, employeeName: payload.sale.employeeName });
      saleRequestKey.current = ""; setPaymentMethod("CASH"); setSaleEmployeeId("");
      setSaleEntryOpen(false); setCashReceived(""); setCart({}); setLateEntry(false); setLateEntryReason(""); setOriginalSaleAt(localDateTimeValue()); await load(outletId, true);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to record sale." }); }
    finally { setWorking(false); }
  }

  async function saveMixing() {
    setWorking(true); setNotice(null);
    try {
      const response = await fetch("/api/pos/mixing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outletId, sources: mixIngredients.map((item) => ({ inventoryId: item.inventoryId, quantity: item.quantity })), menuItemId: mixMenuId, outputQty: Number(mixOutputQty), remarks: mixRemarks }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to save product mixing.");
      setNotice({ kind: "ok", text: payload.message }); setMixingOpen(false); setMixSourceId(""); setMixMenuId(""); setMixSourceQuery(""); setMixOutputQuery(""); setMixSourceQty("1"); setMixIngredients([]); setMixOutputQty("1"); setMixRemarks(""); await load(outletId, true);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to save product mixing." }); }
    finally { setWorking(false); }
  }

  function addMixIngredient() {
    const source = data?.inventory.find((item) => item.id === mixSourceId);
    const quantity = Number(mixSourceQty);
    if (!source) return setNotice({ kind: "error", text: "Select an ingredient from outlet stock." });
    if (!validIngredientQuantity(quantity, source.unitLabel)) return setNotice({ kind: "error", text: "Enter a positive quantity. Pieces and heads must be whole numbers." });
    if (quantity > source.stockQty) return setNotice({ kind: "error", text: `${source.productName} has only ${source.stockQty} available.` });
    setMixIngredients((current) => [...current, { inventoryId: source.id, productName: source.productName, quantity, available: source.stockQty, unitLabel: source.unitLabel }]);
    setMixSourceId(""); setMixSourceQuery(""); setMixSourceQty("1"); setMixSourceResultsOpen(false); setNotice(null);
  }

  async function loadMenuSetup(showCreate = true) {
    setMenuSetupOpen(true); if (showCreate) setNewMenuOpen(true); setMenuSetupLoading(true); setNotice(null);
    try {
      const response = await fetch(`/api/pos/menu?outletId=${encodeURIComponent(outletId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load menu setup.");
      setCatalogItems(payload.catalog || []); setAssignedMenuItems(payload.assigned || []);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to load menu setup." }); setMenuSetupOpen(false); }
    finally { setMenuSetupLoading(false); }
  }

  async function menuAction(action: "ASSIGN" | "UPDATE" | "REMOVE", item: CatalogItem | AssignedMenuItem, price?: number, isAvailable?: boolean) {
    if (menuMutationBusy.current) return;
    menuMutationBusy.current = true;
    setWorking(true); setNotice(null);
    try {
      const request = outletMenuMutation(action, outletId, item.id, price, isAvailable);
      const response = await fetch("/api/pos/menu", { method: request.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.body) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to update menu.");
      if (action === "REMOVE") {
        setAssignedMenuItems((current) => current.filter((entry) => entry.id !== item.id));
        setCart((current) => { const next = { ...current }; delete next[item.id]; return next; });
        if (selectedMenuId === item.id) setSelectedMenuId("");
        if (mixMenuId === item.id) setMixMenuId("");
      }
      await Promise.all([loadMenuSetup(false), load(outletId, true)]);
      setNotice({ kind: "ok", text: payload.message });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to update menu." }); }
    finally { menuMutationBusy.current = false; setWorking(false); }
  }

  async function createMenuItem() {
    const price = Number(newMenuPrice);
    if (!newMenuName.trim() || !Number.isFinite(price) || price < 0) {
      return setNotice({ kind: "error", text: "Enter a product name and valid selling price." });
    }
    setWorking(true); setNotice(null);
    try {
      const response = await fetch("/api/pos/menu", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CREATE", outletId, name: newMenuName.trim(), category: newMenuCategory.trim() || "Others", price }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to create menu product.");
      setNewMenuName(""); setNewMenuCategory("Others"); setNewMenuPrice(""); setNewMenuOpen(false);
      setNotice({ kind: "ok", text: payload.message });
      await Promise.all([loadMenuSetup(false), load(outletId, true)]);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to create menu product." }); }
    finally { setWorking(false); }
  }

  async function loadIncoming() {
    setIncomingOpen(true); setIncomingLoading(true); setNotice(null);
    try {
      const response = await fetch(`/api/pos/transfers?outletId=${encodeURIComponent(outletId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load incoming deliveries.");
      setIncoming(payload.data || []);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to load incoming deliveries." }); }
    finally { setIncomingLoading(false); }
  }

  async function receiveTransfer(transferId: string) {
    setWorking(true); setNotice(null);
    try {
      const response = await fetch(`/api/pos/transfers/${transferId}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outletId }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to receive delivery.");
      setNotice({ kind: "ok", text: payload.message }); await Promise.all([loadIncoming(), load(outletId, true)]);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to receive delivery." }); }
    finally { setWorking(false); }
  }

  async function loadExpenses(selectedDate = expenseDate) {
    setExpensesOpen(true); setExpensesLoading(true); setNotice(null);
    try {
      const response = await fetch(`/api/pos/expenses?outletId=${encodeURIComponent(outletId)}&date=${encodeURIComponent(selectedDate)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load outlet expenses.");
      const nextTypes: ExpenseTypeOption[] = payload.expenseTypes || [];
      setExpenses(payload.data || []); setExpenseTypes(nextTypes); setExpenseTotal(Number(payload.summary?.total || 0));
      setExpenseType((current) => nextTypes.some((item) => item.code === current)
        ? current
        : nextTypes.find((item) => item.code === "OTHERS")?.code || nextTypes[0]?.code || "");
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to load outlet expenses." }); }
    finally { setExpensesLoading(false); }
  }

  async function saveExpense() {
    setWorking(true); setNotice(null);
    try {
      const response = await fetch("/api/pos/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outletId, name: expenseName, expenseDate, type: expenseType, amount: Number(expenseAmount), remarks: expenseRemarks }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to record outlet expense.");
      setNotice({ kind: "ok", text: payload.message }); setExpenseName(""); setExpenseAmount(""); setExpenseRemarks("");
      await Promise.all([loadExpenses(), load(outletId, true)]);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to record outlet expense." }); }
    finally { setWorking(false); }
  }

  async function saveDeduction() {
    setWorking(true); setNotice(null);
    try {
      const response = await fetch("/api/pos/deductions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outletId, inventoryId: deductInventoryId, qty: Number(deductQty), unit: deductUnit, remarks: deductRemarks }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to deduct stock.");
      setNotice({ kind: "ok", text: payload.message }); setDeductionOpen(false); setDeductInventoryId(""); setDeductQty("1"); setDeductUnit("PCS"); setDeductRemarks(""); await load(outletId, true);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to deduct stock." }); }
    finally { setWorking(false); }
  }

  function stockLabel(item: InventoryItem) {
    if (item.packSize > 0) return `${Math.floor(item.stockQty / item.packSize)} pack(s) + ${item.stockQty % item.packSize} pcs (${item.stockQty} pcs total)`;
    return `${item.stockQty} ${item.unitLabel.toLowerCase()}`;
  }

  if (loading && !data) return <div className="flex min-h-[65vh] items-center justify-center"><Loader2 className="size-8 animate-spin" /></div>;
  return <main className="min-h-screen bg-slate-50 p-3 lg:p-4">
    <div className="mx-auto max-w-[1920px] space-y-3">
      <header className="rounded-xl border bg-white text-slate-900">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b p-4">
          <label className="block w-full text-sm font-medium sm:max-w-md">Outlet
            <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={outletId} onChange={(event) => void load(event.target.value)} disabled={working}>
              {(data?.outlets || []).map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name} ({outlet.code})</option>)}
            </select>
          </label>
          <time className="pb-2 text-sm text-slate-500">{data?.dailyReport?.date ? new Date(data.dailyReport.date).toLocaleDateString("en-PH", { dateStyle: "long" }) : ""}</time>
        </div>
        <nav aria-label="Outlet transaction actions" className="flex flex-wrap gap-2 p-3">
          <Button type="button" variant="outline" disabled={!outletId} onClick={() => void loadIncoming()}><PackageCheck className="mr-2 size-4" />Receive Deliveries</Button>
          <Button type="button" variant="outline" disabled={!outletId} onClick={() => setMixingOpen(true)}><Blend className="mr-2 size-4" />Production / Mixing</Button>
          <Button type="button" variant="outline" disabled={!outletId} onClick={() => void loadExpenses()}><ReceiptText className="mr-2 size-4" />Expenses</Button>
          <Button type="button" variant="outline" disabled={!outletId} onClick={() => setEmployeeAccountsOpen(true)}>Employee Accounts</Button>
          <Button type="button" variant="outline" disabled={!outletId} onClick={() => setStockOpen(true)}><Warehouse className="mr-2 size-4" />Stock View</Button>
          <Button type="button" variant="outline" disabled={!outletId} onClick={() => setDeductionOpen(true)}><ArrowDownToLine className="mr-2 size-4" />Deduct Stock</Button>
          <Button type="button" variant="outline" disabled={!outletId} onClick={() => void loadMenuSetup()}><BookOpen className="mr-2 size-4" />Menu Setup</Button>
          <Button type="button" variant="outline" disabled={!outletId} onClick={() => setReportOpen(true)}><FileText className="mr-2 size-4" />Daily Review</Button>
        </nav>
      </header>
      {notice && <div className={`flex items-center justify-between rounded-2xl px-4 py-3 font-semibold ${notice.kind === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}><span className="flex items-center gap-2">{notice.kind === "ok" ? <CheckCircle2 className="size-5" /> : <X className="size-5" />}{notice.text}</span><button onClick={() => setNotice(null)}><X className="size-4" /></button></div>}
      {!data?.outlets.length ? <section className="rounded-3xl bg-white p-12 text-center shadow"><Store className="mx-auto mb-3 size-10 text-slate-400" /><h2 className="text-xl font-bold">No outlet assigned</h2><p className="mt-2 text-slate-500">Ask the administrator to assign your account to an active outlet.</p></section> : <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><h1 className="text-lg font-semibold">Sales Entries</h1><Button type="button" className="h-10 bg-[#d71920] px-4 font-semibold hover:bg-red-700" disabled={!outletId} onClick={() => { setCashReceived(""); setSaleEntryOpen(true); }}><Plus className="mr-2" />Add Sale</Button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-100 text-slate-700"><tr><th className="px-4 py-3 text-left">Time</th><th className="px-4 py-3 text-left">Receipt</th><th className="px-4 py-3 text-center">Quantity</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{data.dailyReport.transactions.map((sale) => <tr key={sale.id} className="border-b"><td className="px-4 py-3">{new Date(sale.saleDate).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</td><td className="px-4 py-3 font-bold">{sale.receiptNumber}<p className="text-xs text-slate-500">{sale.paymentMethod}{sale.employeeName ? ` — ${sale.employeeName}` : ""}</p></td><td className="px-4 py-3 text-center">{sale.totalQty}</td><td className="px-4 py-3 text-right font-semibold">{money.format(sale.totalAmount)}</td></tr>)}{!data.dailyReport.transactions.length && <tr><td colSpan={4} className="py-10 text-center text-slate-500">No sales entries. Select Add Sale to record a transaction.</td></tr>}</tbody><tfoot className="bg-slate-100 font-semibold"><tr><td className="px-4 py-3" colSpan={2}>TOTAL ({data.dailyReport.transactions.length})</td><td className="px-4 py-3 text-center">{data.dailyReport.transactions.reduce((sum, sale) => sum + sale.totalQty, 0)}</td><td className="px-4 py-3 text-right">{money.format(data.dailyReport.revenue)}</td></tr></tfoot></table></div>
      </section>}
    </div>
    {saleEntryOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm">
      <section data-entry-shell className="w-full max-w-5xl overflow-hidden rounded-[30px] bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-[#1b1b1b] px-6 py-5 text-white">
          <div><p className="text-xs font-black uppercase tracking-widest text-[#ffbc0d]">{outletName}</p><h2 className="text-2xl font-black">Record Outlet Sales</h2></div>
          <button onClick={() => setSaleEntryOpen(false)}><X /></button>
        </div>
        <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
          <label className="block text-sm font-bold">Entry type<select className="mt-1 w-full rounded-xl border p-3" value={entryMode} onChange={event => setEntryMode(event.target.value as "TRANSACTION" | "DAILY_TOTAL")}><option value="TRANSACTION">One completed customer transaction</option><option value="DAILY_TOTAL">Daily totals not already entered</option></select></label>
          <p className="rounded-lg bg-amber-50 p-3 text-sm">Do not include sales already recorded. Enter cash sales and each employee’s credit separately. Quantities deduct finished stock when saved.</p>

          <div className="grid gap-3 rounded-2xl border bg-slate-50 p-4 md:grid-cols-[1fr_120px_auto]">
            <label className="text-sm font-bold">Product
              <div className="relative mt-1">
                <Search className="absolute left-3 top-4 z-10 size-4 text-slate-400" />
                <Input
                  className="h-12 pl-10"
                  placeholder="Search outlet product..."
                  value={query}
                  autoComplete="off"
                  onFocus={() => setProductResultsOpen(true)}
                  onChange={(e) => { setQuery(e.target.value); setSelectedMenuId(""); setProductResultsOpen(true); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && menu.length) {
                      e.preventDefault();
                      setSelectedMenuId(menu[0].id);
                      setQuery(menu[0].name);
                      setProductResultsOpen(false);
                    }
                    if (e.key === "Escape") setProductResultsOpen(false);
                  }}
                />
                {productResultsOpen && <div className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-xl">
                  {menu.length ? menu.map((item) => <button
                    key={item.id}
                    type="button"
                    className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left hover:bg-slate-100 ${selectedMenuId === item.id ? "bg-slate-100" : ""}`}
                    onClick={() => { setSelectedMenuId(item.id); setQuery(item.name); setProductResultsOpen(false); }}
                  >
                    <span><b className="block">{item.name}</b><span className="text-xs font-normal text-slate-500">{item.category} · {item.stockQty} {item.unit} available</span></span>
                    <b className="whitespace-nowrap">{money.format(item.price)}</b>
                  </button>) : <p className="px-3 py-6 text-center font-normal text-slate-500">No matching outlet product.</p>}
                </div>}
              </div>
              {selectedMenuId && <p className="mt-2 text-xs font-semibold text-emerald-700">Selected: {data?.menu.find((item) => item.id === selectedMenuId)?.name}</p>}
            </label>
            <label className="text-sm font-bold">Quantity<Input className="mt-1 h-12" type="number" min="1" step="1" value={lineQty} onChange={(e) => setLineQty(e.target.value)} /></label>
            <Button className="h-12 self-end bg-[#1b1b1b] font-black" onClick={addSelectedProduct}><Plus className="mr-2 size-4" />Add</Button>
          </div>
          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-[#111827] text-white"><tr><th className="p-3 text-left">Product</th><th className="p-3 text-center">Qty</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Subtotal</th><th className="w-14 p-3" /></tr></thead>
              <tbody>{rows.map((item) => <tr key={item.id} className="border-b"><td className="p-3"><b>{item.name}</b><p className="text-xs text-slate-500">{item.category}</p></td><td className="p-3"><Input className="mx-auto h-10 w-24 text-center" type="number" min="1" max={item.stockQty} value={item.qty} onChange={(e) => setQty(item, Number(e.target.value))} /></td><td className="p-3 text-right">{money.format(item.price)}</td><td className="p-3 text-right font-black">{money.format(item.price * item.qty)}</td><td className="p-3"><button className="text-red-600" onClick={() => setQty(item, 0)}><Trash2 className="size-4" /></button></td></tr>)}{!rows.length && <tr><td colSpan={5} className="p-10 text-center text-slate-500">Add at least one outlet product.</td></tr>}</tbody>
            </table>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold">Payment<select className="mt-1 w-full rounded-xl border p-3" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="CASH">Cash sale</option><option value="CREDIT">Employee credit (no cash received)</option></select></label>
            {paymentMethod === "CREDIT" && <label className="text-sm font-bold">Employee<select className="mt-1 w-full rounded-xl border p-3" value={saleEmployeeId} onChange={(event) => setSaleEmployeeId(event.target.value)}><option value="">Select employee</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}</select><p className="mt-1 text-xs text-slate-500">Register employees in Employee Accounts. This sale still deducts stock and records revenue / COGS.</p></label>}
            <div className="rounded-2xl border p-4">
              <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={lateEntry} onChange={(e) => setLateEntry(e.target.checked)} />Late sales entry</label>
              {lateEntry && <div className="mt-3 grid gap-3"><label className="text-sm font-bold">Transaction date and time<Input className="mt-1 h-11" type="datetime-local" value={originalSaleAt} onChange={(e) => setOriginalSaleAt(e.target.value)} /></label><label className="text-sm font-bold">Reason<Input className="mt-1 h-11" minLength={3} maxLength={200} placeholder="Why this sale was encoded late" value={lateEntryReason} onChange={(e) => setLateEntryReason(e.target.value)} /></label></div>}
            </div>
            <div className="rounded-2xl bg-[#111827] p-5 text-white">
              <div className="flex justify-between"><span>Total</span><strong className="text-3xl">{money.format(total)}</strong></div>
              {paymentMethod === "CASH" ? <><label className="mt-4 block text-sm font-bold">Cash collected for this entry<Input className="mt-1 h-12 bg-white text-right text-xl font-black text-black" type="number" min={total} step="0.01" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} /></label><div className="mt-3 flex justify-between text-emerald-300"><span>Excess cash / change</span><b>{money.format(Math.max(0, cash - total))}</b></div></> : <p className="mt-4 font-bold text-amber-300">Employee credit balance: {money.format(total)}. Cash received: ₱0.00.</p>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t p-4"><div className="mr-auto"><span className="mr-2 text-sm text-slate-500">Total</span><strong className="text-xl">{money.format(total)}</strong></div><Button variant="outline" onClick={() => setSaleEntryOpen(false)}>Cancel</Button><Button className="bg-emerald-600 font-black hover:bg-emerald-700" disabled={working || !rows.length || (paymentMethod === "CASH" ? cash < total : !saleEmployeeId) || (lateEntry && (!originalSaleAt || lateEntryReason.trim().length < 3))} onClick={() => void checkout()}>{working && <Loader2 className="mr-2 animate-spin" />}Save Sale</Button></div>
      </section>
    </div>}
{employeeAccountsOpen && <EmployeeAccounts key={outletId} outletId={outletId} inventory={data?.inventory || []} onClose={() => setEmployeeAccountsOpen(false)} onCreditSale={(employee) => { if (rows.length && !window.confirm("Replace the current unsaved sale with a new employee credit sale?")) return; setCart({}); setCashReceived(""); setEmployees(current => current.some(row => row._id === employee._id) ? current : [...current, employee]); setEntryMode("TRANSACTION"); setPaymentMethod("CREDIT"); setSaleEmployeeId(employee._id); saleRequestKey.current = ""; setLateEntry(false); setLateEntryReason(""); setOriginalSaleAt(localDateTimeValue()); setEmployeeAccountsOpen(false); setSaleEntryOpen(true); }} onChanged={() => { void load(outletId, true); void loadEmployees(); }} />}
        {expensesOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"><section data-entry-shell className="w-full max-w-5xl overflow-hidden rounded-[30px] bg-white shadow-2xl"><div className="flex items-start justify-between bg-[#1b1b1b] p-6 text-white"><div><p className="text-xs font-black uppercase tracking-widest text-[#ffbc0d]">{outletName}</p><h2 className="text-2xl font-black">Outlet Expenses</h2></div><button onClick={() => setExpensesOpen(false)}><X /></button></div><div className="grid max-h-[72vh] gap-6 overflow-y-auto p-6 lg:grid-cols-[1fr_1.15fr]"><div className="space-y-4"><label className="block text-sm font-bold">Business date<Input className="mt-1 h-12" type="date" value={expenseDate} max={manilaDateString()} onChange={(event) => { setExpenseDate(event.target.value); if (event.target.value) void loadExpenses(event.target.value); }} /></label><label className="block text-sm font-bold">Description<Input className="mt-1 h-12" maxLength={120} placeholder="Example: gasoline or cleaning materials" value={expenseName} onChange={(e) => setExpenseName(e.target.value)} /></label><label className="block text-sm font-bold">Expense type<select className="mt-1 h-12 w-full rounded-xl border px-3" value={expenseType} onChange={(e) => setExpenseType(e.target.value)}>{expenseTypes.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label className="block text-sm font-bold">Amount<Input className="mt-1 h-12" type="number" min="0.01" step="0.01" placeholder="0.00" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} /></label><label className="block text-sm font-bold">Remarks<Input className="mt-1 h-12" maxLength={250} placeholder="Optional notes" value={expenseRemarks} onChange={(e) => setExpenseRemarks(e.target.value)} /></label></div><div><div className="flex items-center justify-between rounded-2xl bg-amber-50 p-4"><span className="font-bold text-amber-900">Expenses for {expenseDate}</span><strong className="text-2xl text-[#d71920]">{money.format(expenseTotal)}</strong></div><div className="mt-3 max-h-[45vh] divide-y overflow-y-auto rounded-2xl border">{expensesLoading ? <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div> : expenses.length ? expenses.map((item) => <div key={item.id} className="flex items-start justify-between gap-4 p-4"><div><p className="font-black">{item.name}</p><p className="text-xs text-slate-500">{expenseTypes.find((type) => type.code === item.type)?.name || item.type.replaceAll("_", " ")}</p></div><b className="whitespace-nowrap text-[#d71920]">{money.format(item.amount)}</b></div>) : <div className="p-12 text-center text-slate-500">No expenses recorded for this date.</div>}</div></div></div><div className="flex justify-end gap-3 border-t p-4"><Button variant="outline" onClick={() => setExpensesOpen(false)}>Cancel</Button><Button className="h-10 min-w-28 bg-[#d71920] font-black hover:bg-red-700" disabled={working || expensesLoading || !expenseName.trim() || Number(expenseAmount) <= 0 || !expenseType} onClick={() => void saveExpense()}>{working && <Loader2 className="mr-2 animate-spin" />}Record Expense</Button></div></section></div>}
    {incomingOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"><section className="w-full max-w-4xl overflow-hidden rounded-[30px] bg-white shadow-2xl"><div className="flex items-start justify-between bg-[#1b1b1b] p-6 text-white"><div><p className="text-xs font-black uppercase tracking-widest text-[#ffbc0d]">Outlet Inventory</p><h2 className="text-2xl font-black">Incoming Deliveries</h2><p className="text-sm text-slate-300">Receive dispatched stock sent to {outletName}.</p></div><button onClick={() => setIncomingOpen(false)}><X /></button></div><div className="max-h-[65vh] space-y-3 overflow-y-auto p-6">{incomingLoading ? <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div> : incoming.length ? incoming.map((transfer) => <article key={transfer.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black">{transfer.transferNumber}</p><p className="text-xs text-slate-500">{new Date(transfer.transferDate).toLocaleDateString("en-PH")} · {transfer.status}</p></div><Button className="bg-emerald-600 font-black hover:bg-emerald-700" disabled={working} onClick={() => void receiveTransfer(transfer.id)}><PackageCheck className="mr-2 size-4" />Receive All</Button></div><div className="mt-3 divide-y rounded-xl bg-slate-50 px-4">{transfer.items.map((item) => <div key={item.id} className="flex justify-between py-2 text-sm"><span>{item.productName}</span><b>{item.qty} {item.unitLabel.toLowerCase()}{item.unitLabel === "PACK" && item.packSize > 0 ? ` (${item.qty * item.packSize} pcs)` : ""}</b></div>)}</div></article>) : <div className="p-12 text-center text-slate-500">No incoming deliveries.</div>}</div><div className="flex justify-end border-t p-4"><Button variant="outline" onClick={() => setIncomingOpen(false)}>Close</Button></div></section></div>}
    {deductionOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"><section data-entry-shell className="w-full max-w-2xl rounded-[30px] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-[#d71920]">Outlet Inventory</p><h2 className="text-2xl font-black">Manual Stock Deduction</h2></div><button onClick={() => setDeductionOpen(false)}><X /></button></div><div className="mt-6 grid gap-4 md:grid-cols-2"><label className="text-sm font-bold md:col-span-2">Product<select className="mt-1 h-12 w-full rounded-xl border px-3" value={deductInventoryId} onChange={(e) => { const item = data?.inventory.find((x) => x.id === e.target.value); setDeductInventoryId(e.target.value); setDeductUnit(item?.packSize ? "PACK" : item?.unitLabel || "PCS"); }}><option value="">Select stock...</option>{(data?.inventory || []).filter((x) => x.stockQty > 0).map((x) => <option key={x.id} value={x.id}>{x.productName} — {stockLabel(x)}</option>)}</select></label><label className="text-sm font-bold">Quantity<Input className="mt-1 h-12" type="number" min="1" step="1" value={deductQty} onChange={(e) => setDeductQty(e.target.value)} /></label><label className="text-sm font-bold">Unit<select className="mt-1 h-12 w-full rounded-xl border px-3" value={deductUnit} onChange={(e) => setDeductUnit(e.target.value)}>{(() => { const item = data?.inventory.find((x) => x.id === deductInventoryId); return item?.packSize ? <><option value="PACK">Pack</option><option value="PCS">PCS</option></> : <option value={item?.unitLabel || "PCS"}>{item?.unitLabel || "PCS"}</option>; })()}</select></label><label className="text-sm font-bold md:col-span-2">Reason / remarks<Input className="mt-1 h-12" minLength={3} maxLength={250} placeholder="Required audit reason" value={deductRemarks} onChange={(e) => setDeductRemarks(e.target.value)} /></label></div><div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={() => setDeductionOpen(false)}>Cancel</Button><Button className="bg-[#d71920] font-black" disabled={working || !deductInventoryId || Number(deductQty) < 1 || deductRemarks.trim().length < 3} onClick={() => void saveDeduction()}>{working && <Loader2 className="mr-2 animate-spin" />}Save Deduction</Button></div></section></div>}
    {stockOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"><section className="w-full max-w-5xl overflow-hidden rounded-[30px] bg-white shadow-2xl"><div className="flex items-start justify-between bg-[#1b1b1b] p-6 text-white"><div><p className="text-xs font-black uppercase tracking-widest text-[#ffbc0d]">{outletName}</p><h2 className="text-2xl font-black">Current Stock</h2></div><button onClick={() => setStockOpen(false)}><X /></button></div><div className="p-6"><div className="relative"><Search className="absolute left-3 top-3.5 size-4 text-slate-400" /><Input className="h-11 pl-10" placeholder="Search product or category..." value={stockQuery} onChange={(e) => setStockQuery(e.target.value)} /></div><div className="mt-4 max-h-[58vh] overflow-auto rounded-2xl border"><table className="w-full min-w-[720px] text-sm"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-3 text-left">Product</th><th className="p-3 text-left">Category</th><th className="p-3 text-center">Source</th><th className="p-3 text-right">Current Stock</th><th className="p-3 text-right">Unit Cost</th></tr></thead><tbody>{(data?.inventory || []).filter((item) => `${item.productName} ${item.categoryName}`.toLowerCase().includes(stockQuery.trim().toLowerCase())).map((item) => <tr key={item.id} className="border-t"><td className="p-3 font-bold">{item.productName}</td><td className="p-3">{item.categoryName}</td><td className="p-3 text-center">{item.productSource}</td><td className="p-3 text-right font-bold">{stockLabel(item)}</td><td className="p-3 text-right">{money.format(item.buyingPrice)}</td></tr>)}</tbody></table></div></div><div className="flex justify-end border-t p-4"><Button variant="outline" onClick={() => setStockOpen(false)}>Close</Button></div></section></div>}
    {menuSetupOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm"><section data-entry-shell className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[30px] bg-white shadow-2xl"><div className="flex items-start justify-between border-b px-7 py-6"><div><p className="text-xs font-black uppercase tracking-widest text-[#d71920]">{outletName}</p><h2 className="text-3xl font-black">Menu Setup</h2><p className="text-sm text-slate-500">Select products from the shared menu catalog and set this outlet&apos;s selling price.</p></div><button type="button" onClick={() => setMenuSetupOpen(false)}><X /></button></div>{notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`border-b px-7 py-3 text-sm font-semibold ${notice.kind === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{notice.text}</div>}<div className="border-b p-5"><div className="relative"><Search className="absolute left-3 top-3.5 size-4 text-slate-400" /><Input className="h-11 pl-10" placeholder="Search product or category..." value={menuSetupQuery} onChange={(e) => setMenuSetupQuery(e.target.value)} /></div></div><div className="grid min-h-0 flex-1 divide-y overflow-y-auto lg:grid-cols-2 lg:divide-x lg:divide-y-0"><div className="p-5"><h3 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-500">Available in shared catalog</h3>{menuSetupLoading ? <Loader2 className="mx-auto my-12 animate-spin" /> : <div className="space-y-2">{catalogItems.filter((item) => !item.assigned && `${item.name} ${item.category}`.toLowerCase().includes(menuSetupQuery.trim().toLowerCase())).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border p-3"><div className="min-w-0 flex-1"><b className="block truncate">{item.name}</b><span className="text-xs text-slate-500">{item.category}</span></div><Input id={`catalog-price-${item.id}`} className="h-9 w-28 text-right" type="number" min="0" defaultValue={item.defaultPrice} /><Button type="button" size="sm" disabled={working} onClick={() => { const input = document.getElementById(`catalog-price-${item.id}`) as HTMLInputElement | null; void menuAction("ASSIGN", item, Number(input?.value ?? item.defaultPrice), true); }}><Plus className="mr-1 size-4" />Add</Button></div>)}{!catalogItems.some((item) => !item.assigned && `${item.name} ${item.category}`.toLowerCase().includes(menuSetupQuery.trim().toLowerCase())) && <p className="py-10 text-center text-sm text-slate-500">No unassigned products match.</p>}</div>}</div><div className="p-5"><h3 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-500">This outlet&apos;s menu</h3><div className="space-y-2">{assignedMenuItems.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(menuSetupQuery.trim().toLowerCase())).map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl border p-3"><div className="min-w-0 flex-1"><b className="block truncate">{item.name}</b><span className="text-xs text-slate-500">{item.category}</span></div><Input id={`assigned-price-${item.id}`} className="h-9 w-28 text-right" type="number" min="0" defaultValue={item.price} /><label className="flex items-center gap-1 text-xs"><input id={`assigned-available-${item.id}`} type="checkbox" defaultChecked={item.isAvailable} />Sell</label><Button type="button" size="sm" variant="outline" disabled={working} onClick={() => { const price = document.getElementById(`assigned-price-${item.id}`) as HTMLInputElement | null; const available = document.getElementById(`assigned-available-${item.id}`) as HTMLInputElement | null; void menuAction("UPDATE", item, Number(price?.value ?? item.price), available?.checked); }}>Save</Button><Button type="button" size="icon" variant="ghost" className="text-red-600" disabled={working} aria-label={`Remove ${item.name} from outlet menu`} title="Remove from this outlet menu" onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (window.confirm(`Remove ${item.name} from this outlet menu?`)) void menuAction("REMOVE", item); }}><Trash2 className="size-4" /></Button></div>)}{!assignedMenuItems.length && <p className="py-10 text-center text-sm text-slate-500">This outlet has no menu products yet.</p>}</div></div></div><div className="flex justify-end border-t p-4"><Button type="button" variant="outline" onClick={() => setMenuSetupOpen(false)}>Close</Button></div></section></div>}
    {newMenuOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"><section data-entry-shell className="w-full max-w-3xl overflow-hidden rounded-[28px] bg-white shadow-2xl"><div className="flex items-start justify-between border-b px-6 py-5"><div><p className="text-xs font-black uppercase tracking-widest text-[#d71920]">{outletName}</p><h2 className="text-2xl font-black">Create New Menu Product</h2><p className="text-xs text-slate-500">Shared menu catalog</p></div><button onClick={() => setNewMenuOpen(false)}><X /></button></div><div className="grid gap-4 p-6 md:grid-cols-2"><label className="text-sm font-bold md:col-span-2">Product name<Input className="mt-1 h-12" maxLength={120} placeholder="Example: Buttered Chicken" value={newMenuName} onChange={(e) => setNewMenuName(e.target.value)} /></label><label className="text-sm font-bold">Category<Input className="mt-1 h-12" maxLength={80} placeholder="Example: Buttered" value={newMenuCategory} onChange={(e) => setNewMenuCategory(e.target.value)} /></label><label className="text-sm font-bold">Selling price<Input className="mt-1 h-12" type="number" min="0" step="0.01" placeholder="0.00" value={newMenuPrice} onChange={(e) => setNewMenuPrice(e.target.value)} /></label></div><div className="flex justify-end gap-3 border-t p-4"><Button variant="outline" onClick={() => setNewMenuOpen(false)}>Browse Existing Menu</Button><Button className="bg-[#d71920] font-black hover:bg-[#b91319]" disabled={working || !newMenuName.trim() || newMenuPrice === ""} onClick={() => void createMenuItem()}>{working && <Loader2 className="mr-2 animate-spin" />}Create & Add</Button></div></section></div>}
    {mixingOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm">
      <section data-entry-shell className="w-full max-w-6xl overflow-hidden rounded-[30px] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b px-7 py-6">
          <div><p className="text-xs font-black uppercase tracking-widest text-[#d71920]">Outlet Production</p><h2 className="text-3xl font-black">Product Mixing</h2><p className="text-sm text-slate-500">Combine multiple outlet ingredients into a sellable product. The complete batch cost is allocated to every output unit.</p></div>
          <button onClick={() => setMixingOpen(false)}><X /></button>
        </div>
        <div className="max-h-[72vh] overflow-y-auto p-7">
          {notice?.kind === "error" && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{notice.text}</p>}
          <div className="grid gap-6 lg:grid-cols-2">
            <label className="text-sm font-bold">Source ingredient
              <div className="relative mt-1">
                <Search className="absolute left-3 top-4 z-10 size-4 text-slate-400" />
                <Input className="h-12 pl-10" placeholder="Search outlet stock..." value={mixSourceQuery} autoComplete="off" onFocus={() => { setMixSourceResultsOpen(true); setMixOutputResultsOpen(false); }} onChange={(e) => { setMixSourceQuery(e.target.value); setMixSourceId(""); setMixSourceResultsOpen(true); setMixOutputResultsOpen(false); }} />
                {mixSourceResultsOpen && <div className="absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-xl">
                  {mixingSources.length ? mixingSources.map((item) => <button key={item.id} type="button" className="flex w-full justify-between gap-4 rounded-lg px-3 py-3 text-left hover:bg-slate-100" onClick={() => { setMixSourceId(item.id); setMixSourceQuery(item.productName); setMixSourceResultsOpen(false); }}><span><b className="block">{item.productName}</b><span className="text-xs font-normal text-slate-500">{item.categoryName} · {item.productSource}</span></span><b className="whitespace-nowrap">{stockLabel(item)}</b></button>) : <p className="px-3 py-8 text-center font-normal text-slate-500">No matching stock with available quantity.</p>}
                </div>}
              </div>
              {mixSourceId && <p className="mt-2 text-xs font-semibold text-emerald-700">Selected: {data?.inventory.find((item) => item.id === mixSourceId)?.productName}</p>}
            </label>
            <label className="text-sm font-bold">Output menu product
              <div className="relative mt-1">
                <Search className="absolute left-3 top-4 z-10 size-4 text-slate-400" />
                <Input className="h-12 pl-10" placeholder="Search output menu product..." value={mixOutputQuery} autoComplete="off" onFocus={() => { setMixOutputResultsOpen(true); setMixSourceResultsOpen(false); }} onChange={(e) => { setMixOutputQuery(e.target.value); setMixMenuId(""); setMixOutputResultsOpen(true); setMixSourceResultsOpen(false); }} />
                {mixOutputResultsOpen && <div className="absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-xl">
                  {mixingOutputs.length ? mixingOutputs.map((item) => <button key={item.id} type="button" className="flex w-full justify-between gap-4 rounded-lg px-3 py-3 text-left hover:bg-slate-100" onClick={() => { setMixMenuId(item.id); setMixOutputQuery(item.name); setMixOutputResultsOpen(false); }}><span><b className="block">{item.name}</b><span className="text-xs font-normal text-slate-500">{item.category}</span></span><b className="whitespace-nowrap">{money.format(item.price)}</b></button>) : <p className="px-3 py-8 text-center font-normal text-slate-500">No matching menu product.</p>}
                </div>}
              </div>
              {mixMenuId && <p className="mt-2 text-xs font-semibold text-emerald-700">Selected: {data?.menu.find((item) => item.id === mixMenuId)?.name}</p>}
            </label>
            <div className="text-sm font-bold">Ingredient quantity
              <div className="mt-1 flex gap-3"><Input className="h-12" type="number" min="0.0001" step="any" value={mixSourceQty} onChange={(e) => setMixSourceQty(e.target.value)} /><Button type="button" className="h-12 whitespace-nowrap bg-slate-900 font-black" disabled={!mixSourceId || Number(mixSourceQty) <= 0} onClick={addMixIngredient}><Plus className="mr-2 size-4" />Add Ingredient</Button></div>
            </div>
            <label className="text-sm font-bold">Output quantity<Input className="mt-1 h-12" type="number" min="1" step="1" value={mixOutputQty} onChange={(e) => setMixOutputQty(e.target.value)} /></label>
            <div className="lg:col-span-2">
              <p className="mb-2 text-sm font-black">Batch ingredients ({mixIngredients.length})</p>
              <div className="overflow-hidden rounded-2xl border">
                <table className="w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-3 text-left">Ingredient</th><th className="p-3 text-center">Quantity Used</th><th className="p-3 text-center">Available</th><th className="w-16 p-3"></th></tr></thead><tbody>{mixIngredients.map((ingredient) => <tr key={ingredient.inventoryId} className="border-t"><td className="p-3 font-bold">{ingredient.productName}</td><td className="p-3 text-center font-bold">{ingredient.quantity} {ingredient.unitLabel.toLowerCase()}</td><td className="p-3 text-center">{ingredient.available} {ingredient.unitLabel.toLowerCase()}</td><td className="p-3 text-right"><Button type="button" size="icon" variant="ghost" className="text-red-600" onClick={() => setMixIngredients((current) => current.filter((item) => item.inventoryId !== ingredient.inventoryId))}><Trash2 className="size-4" /></Button></td></tr>)}{!mixIngredients.length && <tr><td colSpan={4} className="p-8 text-center text-slate-500">Search an ingredient, enter its quantity, and select Add Ingredient.</td></tr>}</tbody></table>
              </div>
            </div>
            <label className="text-sm font-bold lg:col-span-2">Remarks<Input className="mt-1 h-12" maxLength={250} placeholder="Optional mixing notes" value={mixRemarks} onChange={(e) => setMixRemarks(e.target.value)} /></label>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t p-5"><Button variant="outline" onClick={() => setMixingOpen(false)}>Cancel</Button><Button className="bg-[#d71920] font-black" disabled={working || !mixIngredients.length || !mixMenuId || !Number.isSafeInteger(Number(mixOutputQty)) || Number(mixOutputQty) < 1} onClick={() => void saveMixing()}>{working && <Loader2 className="mr-2 animate-spin" />}Save Production Batch</Button></div>
      </section>
    </div>}
    {reportOpen && data?.dailyReport && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"><section className="w-full max-w-7xl overflow-hidden rounded-[30px] bg-white shadow-2xl"><div className="flex items-center justify-between bg-[#1b1b1b] px-6 py-5 text-white"><div><p className="text-xs font-black uppercase tracking-widest text-[#ffbc0d]">{outletName}</p><h2 className="text-2xl font-black">Outlet Daily Review</h2></div><button onClick={() => setReportOpen(false)}><X /></button></div><div className="pos-daily-report max-h-[75vh] overflow-y-auto p-6"><div className="text-center"><h2 className="text-xl font-black">ISAY FRIED CHICKEN</h2><p>{outletName}</p><p className="text-sm text-slate-500">Outlet Daily Review · {new Date(data.dailyReport.date).toLocaleDateString("en-PH")}</p></div><div className="mt-6 overflow-x-auto rounded-xl border"><table className="w-full min-w-[980px] text-sm"><thead><tr className="bg-slate-100"><th className="p-3 text-left">Date / Time</th><th className="p-3 text-left">Receipt</th><th className="p-3 text-center">Qty</th><th className="p-3 text-right">Sales</th><th className="p-3 text-right">COGS</th><th className="p-3 text-right">Gross Profit</th><th className="p-3 text-right">Expenses</th><th className="p-3 text-right">Net Profit</th></tr></thead><tbody>{data.dailyReport.transactions.map((sale) => <tr key={sale.id} className="border-t"><td className="p-3">{new Date(sale.saleDate).toLocaleString("en-PH", { dateStyle: "short", timeStyle: "short" })}</td><td className="p-3 font-semibold">{sale.receiptNumber}<p className="text-xs text-slate-500">{sale.paymentMethod}{sale.employeeName ? ` — ${sale.employeeName}` : ""}{sale.paymentMethod === "CREDIT" ? ` · ${Number(sale.balance || 0) <= 0 ? "PAID" : Number(sale.paidAmount || 0) > 0 ? "PARTIAL" : "UNPAID"} · Balance ${money.format(Number(sale.balance || 0))}` : ""}</p></td><td className="p-3 text-center">{sale.totalQty}</td><td className="p-3 text-right">{money.format(sale.totalAmount)}</td><td className="p-3 text-right">{money.format(sale.cogs)}</td><td className="p-3 text-right font-semibold">{money.format(sale.grossProfit)}</td><td className="p-3 text-center text-slate-400">—</td><td className="p-3 text-center text-slate-400">—</td></tr>)}{!data.dailyReport.transactions.length && <tr><td colSpan={8} className="p-10 text-center text-slate-500">No outlet sales entries for this date.</td></tr>}</tbody><tfoot><tr className="border-t-2 bg-slate-100 font-black"><td className="p-3" colSpan={2}>TOTAL ({data.dailyReport.transactions.length})</td><td className="p-3 text-center">{data.dailyReport.transactions.reduce((sum, sale) => sum + sale.totalQty, 0)}</td><td className="p-3 text-right">{money.format(data.dailyReport.revenue)}</td><td className="p-3 text-right">{money.format(data.dailyReport.cogs)}</td><td className="p-3 text-right">{money.format(data.dailyReport.grossProfit)}</td><td className="p-3 text-right">{money.format(data.dailyReport.expenses)}</td><td className={`p-3 text-right ${data.dailyReport.netProfit < 0 ? "text-red-600" : "text-emerald-700"}`}>{money.format(data.dailyReport.netProfit)}</td></tr></tfoot></table></div><section className="mt-5"><h3 className="mb-2 font-black">Cash movement (separate from profit)</h3><table className="w-full text-sm"><tbody>{[["Cash sales", data.dailyReport.cash.cashSales], ["Employee credit collections", data.dailyReport.cash.collections], ["Less: cash expenses", -data.dailyReport.cash.expenses], ["Less: employee reimbursements", -data.dailyReport.cash.reimbursements], ["NET CASH MOVEMENT (excludes opening cash / remittances)", data.dailyReport.cash.netCashMovement]].map(([label, value]) => <tr key={label} className="border-b last:bg-slate-100 last:font-black"><td className="p-3">{label}</td><td className="p-3 text-right">{money.format(Number(value))}</td></tr>)}</tbody></table></section><p className="mt-3 text-xs text-slate-500">Expenses apply to the full business day, so they are shown only in the final total row.</p></div><div className="flex justify-end gap-3 border-t p-4"><Button variant="outline" onClick={() => setReportOpen(false)}>Close</Button><Button className="bg-[#1b1b1b] font-black" onClick={() => window.print()}><Printer className="mr-2" />Print Daily Review</Button></div></section></div>}
    {receipt && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3">
      <section className="w-full max-w-md rounded-[30px] bg-white p-5 text-center">
        <CheckCircle2 className="mx-auto size-16 text-emerald-600" />
        <h2 className="text-2xl font-black">Sale Saved</h2>
        <p className="text-slate-500">{receipt.receiptNumber}{receipt.isLateEntry ? " · Late entry" : ""}</p>
        <div className="pos-receipt mt-5 rounded-2xl border border-dashed p-5 text-left">
          <div className="text-center"><h3 className="font-black">ISAY FRIED CHICKEN</h3><p className="text-xs">{receipt.outletName}</p><p className="text-xs">{receipt.receiptNumber} · {new Date(receipt.saleDate).toLocaleString("en-PH")}</p></div>
          <div className="my-4 border-t border-dashed" />
          {receipt.items.map((item) => <div key={item.id} className="flex justify-between text-sm"><span>{item.qty} x {item.name}</span><b>{money.format(item.qty * item.price)}</b></div>)}
          <div className="mt-3 border-t border-dashed pt-3"><div className="flex justify-between text-lg font-black"><span>TOTAL</span><span>{money.format(receipt.total)}</span></div>{receipt.paymentMethod === "CREDIT" ? <p className="text-sm font-bold">EMPLOYEE CREDIT — {receipt.employeeName}<br />Unpaid: {money.format(receipt.total)}</p> : <><div className="flex justify-between text-sm"><span>Cash</span><span>{money.format(receipt.cash)}</span></div><div className="flex justify-between text-sm"><span>Change</span><span>{money.format(receipt.change)}</span></div></>}</div>
          <p className="mt-5 text-center text-xs">Thank you! Please come again.</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3"><Button variant="outline" onClick={() => window.print()}><Printer className="mr-2" />Print</Button><Button className="bg-[#d71920] font-black" onClick={() => { setReceipt(null); setCashReceived(""); setSaleEntryOpen(true); }}>Add Another Sale</Button></div>
      </section>
    </div>}
    <style jsx global>{`[data-entry-shell] { display:flex;flex-direction:column;max-height:90dvh;overflow:hidden;padding:0 }
      [data-entry-shell] > div:first-child { flex-shrink:0;padding:1rem 1.25rem }
      [data-entry-shell] > div:last-child { flex-shrink:0;margin-top:0;padding:1rem 1.25rem }
      [data-entry-shell] > div:not(:first-child):not(:last-child) { min-height:0;flex:1 1 auto;overflow-y:auto;padding:1rem 1.25rem }
      @media print { body * { visibility:hidden!important } .pos-receipt,.pos-receipt *,.pos-daily-report,.pos-daily-report * { visibility:visible!important } .pos-receipt { position:absolute!important;left:0;top:0;width:80mm;border:0!important } .pos-daily-report { position:absolute!important;left:0;top:0;width:100%!important;max-height:none!important;overflow:visible!important;padding:12mm!important } }`}</style>
  </main>;
}
