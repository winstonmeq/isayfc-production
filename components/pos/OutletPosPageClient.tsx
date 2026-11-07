"use client";
import Link from "next/link";
import { OutletReportsPage } from "@/components/pos/OutletReportsPage";
import { OutletStockControlPage } from "@/components/pos/OutletStockControlPage";
import { useRouter } from "next/navigation";
import { OutletMenuDialog } from "@/components/pos/OutletMenuDialog";
import { OutletExpensesDialog } from "@/components/pos/OutletExpensesDialog";
import { OutletInventoryDialog } from "@/components/pos/OutletInventoryDialog";
import { IncomingDeliveriesDialog } from "@/components/pos/IncomingDeliveriesDialog";
import { readApiResponse } from "@/lib/api-response";
import { emptyPosDailyReport } from "@/lib/pos-empty-report";
import { TablePagination } from "@/components/erp/TablePagination";
import { paginateTable } from "@/lib/table-pagination";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDownToLine, Banknote, Blend, BookOpen, Building2, Calendar, Check, CheckCircle2, ChevronsUpDown, FileText, Info, Loader2, Package, PackageCheck, Plus, Printer, ReceiptText, Search, ShoppingCart, Store, Trash2, Truck, Warehouse, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/pos/OutletTaskSurface";
import { EntryDialogContent } from "@/components/erp/EntryForm";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { manilaDateString } from "@/lib/date-utils";
import { validIngredientQuantity } from "@/lib/business-flow";

type Outlet = { id: string; name: string; code: string };
type MenuItem = { id: string; name: string; category: string; price: number; imageUrl: string; stockQty: number; unit: string };
type Shift = { id: string; expectedCash: number; salesCount: number };
type RecentSale = { id: string; receiptNumber: string; totalAmount: number; totalQty: number };
type InventoryItem = { id: string; productName: string; categoryName: string; productSource: string; stockQty: number; unitLabel: string; packSize: number; buyingPrice: number; usage?: string };
type IncomingTransferItem = {
  itemStatus?: string;
  remarks?: string;
  id: string;
  productName: string;
  categoryName?: string;
  source: "BODEGA" | "GROCERY";
  qty: number;
  unitLabel: string;
  packSize: number;
  baseUnit?: string;
  baseQty?: number;
  price: number;
  totalAmount: number;
};
type IncomingTransfer = {
  id: string;
  transferNumber: string;
  status: string;
  transferDate: string;
  remarks?: string;
  totalItems?: number;
  totalQty?: number;
  totalAmount?: number;
  items: IncomingTransferItem[];
};
type DailyReport = {
  date: string;
  revenue: number;
  cogs: number;
  expenses: number;
  cashSaleExpenses?: number;
  periodExpenses?: number;
  grossProfit: number;
  netProfit: number;
  cash: { cashSales: number; collections: number; expenses: number; reimbursements: number; netCashMovement: number };
  transactions: Array<{
    id: string;
    receiptNumber: string;
    totalAmount: number;
    totalQty: number;
    cogs: number;
    grossProfit: number;
    saleDate: string;
    paymentMethod?: string;
    employeeName?: string;
    paidAmount?: number;
    balance?: number;
  }>;
};
type Bootstrap = { success: boolean; canManageInventory?: boolean; message?: string; outlets: Outlet[]; outletId: string; menu: MenuItem[]; inventory: InventoryItem[]; shift: Shift | null; recentSales: RecentSale[]; dailyReport: DailyReport };
type CartEntry = MenuItem & { qty: number };
type Receipt = { receiptNumber: string; outletName: string; total: number; cash: number; change: number; items: CartEntry[]; saleDate: string; isLateEntry: boolean; paymentMethod?: string; employeeName?: string };
type MixIngredient = { inventoryId: string; productName: string; quantity: number; available: number; unitLabel: string; unitCost: number; usage?: string };

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });

function localDateTimeValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function renderUsageTag(usage?: string) {
  if (usage === "SELLING_EXPENSE") {
    return <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700 border border-purple-200">Selling Expense</span>;
  }
  if (usage === "OPERATING_EXPENSE") {
    return <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">Operating Expense</span>;
  }
  if (usage === "PRODUCTION_OVERHEAD") {
    return <span className="inline-flex items-center rounded-md bg-cyan-50 px-2 py-0.5 text-[11px] font-bold text-cyan-700 border border-cyan-200">Production Overhead</span>;
  }
  if (usage === "RETAIL_RESALE") {
    return <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 border border-slate-200">Retail Resale</span>;
  }
  return <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200">Production Cost</span>;
}

function usageDestinationPill(usage?: string) {
  if (usage === "SELLING_EXPENSE") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-purple-100/90 px-2.5 py-0.5 text-xs font-black text-purple-800">→ Outlet Expenses (Selling)</span>;
  }
  if (usage === "OPERATING_EXPENSE") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/90 px-2.5 py-0.5 text-xs font-black text-amber-900">→ Outlet Expenses (Operating)</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100/90 px-2.5 py-0.5 text-xs font-black text-blue-800">→ Menu Inventory Cost (COGS)</span>;
}

function MixingIngredientPicker({
  inventory,
  value,
  onSelect,
  disabled = false,
  excludedIds = new Set<string>(),
}: {
  inventory: InventoryItem[];
  value: string;
  onSelect: (inventoryId: string) => void;
  disabled?: boolean;
  excludedIds?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const selectedItem = inventory.find((item) => item.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          aria-expanded={open}
          className="h-10 w-full justify-between bg-white px-3 font-normal text-left"
        >
          <span className="truncate">
            {selectedItem ? (
              <span className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 truncate">{selectedItem.productName}</span>
                <span className="text-xs text-slate-500 shrink-0">
                  ({selectedItem.stockQty} {selectedItem.unitLabel.toLowerCase()} avail)
                </span>
              </span>
            ) : (
              <span className="text-slate-400">Select product</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search product..." />
          <CommandList className="max-h-64">
            <CommandEmpty>No matching product found.</CommandEmpty>
            <CommandGroup>
              {inventory
                .filter((item) => item.stockQty > 0 && (!excludedIds.has(item.id) || item.id === value))
                .map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.productName} ${item.categoryName || ""} ${item.productSource || ""}`}
                    onSelect={() => {
                      onSelect(item.id);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between gap-3 py-2 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900 truncate">{item.productName}</span>
                        {renderUsageTag(item.usage)}
                      </div>
                      <p className="text-xs text-slate-500">
                        {item.categoryName || "General"} · {money.format(item.buyingPrice)} / {item.unitLabel.toLowerCase()}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                      {item.stockQty} {item.unitLabel.toLowerCase()}
                    </span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function MixingOutputPicker({
  menu,
  value,
  onSelect,
  disabled = false,
}: {
  menu: MenuItem[];
  value: string;
  onSelect: (menuItemId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedItem = menu.find((item) => item.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          aria-expanded={open}
          className="h-10 w-full justify-between bg-white px-3 font-normal text-left"
        >
          <span className="truncate">
            {selectedItem ? (
              <span className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 truncate">{selectedItem.name}</span>
                <span className="text-xs text-slate-500 shrink-0">
                  ({selectedItem.category} · {money.format(selectedItem.price)})
                </span>
              </span>
            ) : (
              <span className="text-slate-400">Select output menu product...</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search menu product..." />
          <CommandList className="max-h-64">
            <CommandEmpty>No menu product found.</CommandEmpty>
            <CommandGroup>
              {menu.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.category}`}
                  onSelect={() => {
                    onSelect(item.id);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between gap-3 py-2 cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-900 block truncate">{item.name}</span>
                    <span className="text-xs text-slate-500">{item.category}</span>
                  </div>
                  <b className="text-sm font-bold text-slate-800 whitespace-nowrap">
                    {money.format(item.price)}
                  </b>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function OutletPosPageClient({ initialOutletId, view = "sales" }: { initialOutletId: string; view?: "sales" | "mixing" | "expenses" | "inventory" | "deliveries" | "reports" | "stock-control" }) {
  const router = useRouter();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [outletId, setOutletId] = useState("");
  const [query, setQuery] = useState("");
  const [productResultsOpen, setProductResultsOpen] = useState(false);
  const [selectedMenuId, setSelectedMenuId] = useState("");
  const [lineQty, setLineQty] = useState("1");
  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [saleItemsPage, setSaleItemsPage] = useState(1);
  const [saleItemsPageSize, setSaleItemsPageSize] = useState(25);
  const [cashReceived, setCashReceived] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [employeeAccountId, setEmployeeAccountId] = useState("");
  const [employees, setEmployees] = useState<Array<{ _id: string; code: string; name: string }>>([]);
  const [entryMode, setEntryMode] = useState<"TRANSACTION" | "DAILY_TOTAL">("TRANSACTION");
  const [saleEntryOpen, setSaleEntryOpen] = useState(false);
  const saleRequestKey = useRef("");
  const [lateEntry, setLateEntry] = useState(false);
  const [originalSaleAt, setOriginalSaleAt] = useState(() => localDateTimeValue());
  const [lateEntryReason, setLateEntryReason] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [mixingOpen, setMixingOpen] = useState(false);
  const [menuSetupOpen, setMenuSetupOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [incomingOpen, setIncomingOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [deductionOpen, setDeductionOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [incoming, setIncoming] = useState<IncomingTransfer[]>([]);
  const [incomingLoading, setIncomingLoading] = useState(false);
  const receivingDelivery = useRef(false);
  const [deductInventoryId, setDeductInventoryId] = useState("");
  const [deductQty, setDeductQty] = useState("1");
  const [deductUnit, setDeductUnit] = useState("PCS");
  const [deductRemarks, setDeductRemarks] = useState("");
  const [mixMenuId, setMixMenuId] = useState("");
  const [mixOutputQty, setMixOutputQty] = useState("1");
  const [mixRemarks, setMixRemarks] = useState("");
  const [mixRows, setMixRows] = useState<Array<{ inventoryId: string; quantity: string }>>([
    { inventoryId: "", quantity: "1" },
  ]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async (selected?: string, preserveCart = false) => {
    setLoading(true);
    try {
      const requestedOutlet = selected || initialOutletId;
      const response = await fetch(`/api/pos?outletId=${encodeURIComponent(requestedOutlet)}`, { cache: "no-store" });
      const payload = await readApiResponse<Bootstrap>(response);
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load outlet operations.");
      if (!Array.isArray(payload.outlets)) throw new Error("Unable to load the outlet list. Refresh and retry.");
      if (payload.outletId !== initialOutletId) throw new Error("The selected outlet could not be loaded. Return to the outlet list and try again.");
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
  }, [initialOutletId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!saleEntryOpen || !outletId) return;
    const controller = new AbortController();
    setEmployees([]);
    fetch(`/api/employees?outletId=${encodeURIComponent(outletId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const json = await response.json(); if (!response.ok || !json.success) throw new Error(json.message || "Unable to load employees."); if (!controller.signal.aborted) setEmployees(json.employees); })
      .catch(error => { if (!controller.signal.aborted) setNotice({ kind: "error", text: error.message }); });
    return () => controller.abort();
  }, [saleEntryOpen, outletId]);

  const menu = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (data?.menu || []).filter((x) => !search || `${x.name} ${x.category}`.toLowerCase().includes(search));
  }, [data?.menu, query]);
  const activeMixIngredients = useMemo<MixIngredient[]>(() => {
    const list: MixIngredient[] = [];
    for (const row of mixRows) {
      if (!row.inventoryId) continue;
      const source = data?.inventory.find((item) => item.id === row.inventoryId);
      if (!source) continue;
      const quantity = Number(row.quantity) || 0;
      list.push({
        inventoryId: source.id,
        productName: source.productName,
        quantity,
        available: Number(source.stockQty || 0),
        unitLabel: source.unitLabel || "PCS",
        unitCost: Number(source.buyingPrice || 0),
        usage: source.usage,
      });
    }
    return list;
  }, [data?.inventory, mixRows]);

  const mixSummary = useMemo(() => {
    let prodCost = 0;
    let sellingExp = 0;
    let operatingExp = 0;
    for (const item of activeMixIngredients) {
      const lineCost = Number(item.unitCost || 0) * Number(item.quantity || 0);
      const u = item.usage;
      if (u === "SELLING_EXPENSE") {
        sellingExp += lineCost;
      } else if (u === "OPERATING_EXPENSE") {
        operatingExp += lineCost;
      } else {
        prodCost += lineCost;
      }
    }
    const outQty = Math.max(1, Number(mixOutputQty) || 1);
    return {
      prodCost: Math.round(prodCost * 100) / 100,
      unitProdCost: Math.round((prodCost / outQty) * 100) / 100,
      sellingExp: Math.round(sellingExp * 100) / 100,
      operatingExp: Math.round(operatingExp * 100) / 100,
      totalExpenses: Math.round((sellingExp + operatingExp) * 100) / 100,
      totalBatch: Math.round((prodCost + sellingExp + operatingExp) * 100) / 100,
      hasProdCost: prodCost > 0 || activeMixIngredients.some((i) => i.usage !== "SELLING_EXPENSE" && i.usage !== "OPERATING_EXPENSE"),
    };
  }, [activeMixIngredients, mixOutputQty]);

  function addMixRow() {
    setMixRows((prev) => [...prev, { inventoryId: "", quantity: "1" }]);
  }

  function updateMixRow(index: number, field: "inventoryId" | "quantity", value: string) {
    setMixRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function removeMixRow(index: number) {
    setMixRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : [{ inventoryId: "", quantity: "1" }]));
  }

  const rows = Object.values(cart);
  const saleItemsPagination = paginateTable(rows, saleItemsPage, saleItemsPageSize);
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
      const response = await fetch("/api/pos/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outletId, paymentMethod, employeeAccountId: paymentMethod === "CREDIT" ? employeeAccountId : undefined, idempotencyKey: saleRequestKey.current, cashReceived: paymentMethod === "CREDIT" ? 0 : cash, remarks: `${entryMode === "DAILY_TOTAL" ? "DAILY TOTALS ENTRY" : "INDIVIDUAL TRANSACTION"}${lateEntry ? `; LATE ENTRY: ${lateEntryReason.trim()}` : ""}`, isLateEntry: lateEntry, originalSaleAt: lateEntry ? new Date(originalSaleAt).toISOString() : undefined, lateEntryReason: lateEntry ? lateEntryReason : undefined, items: soldItems.map((x) => ({ menuItemId: x.id, qty: x.qty })) }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to record sale.");
      setReceipt({ receiptNumber: payload.sale.receiptNumber, outletName, total: payload.sale.totalAmount, cash: paymentMethod === "CREDIT" ? 0 : cash, change: payload.sale.change, items: soldItems, saleDate: payload.sale.saleDate, isLateEntry: payload.sale.isLateEntry, paymentMethod: payload.sale.paymentMethod, employeeName: payload.sale.employeeName });
      setPaymentMethod("CASH"); setEmployeeAccountId("");
      saleRequestKey.current = "";
      setSaleEntryOpen(false); setCashReceived(""); setCart({}); setLateEntry(false); setLateEntryReason(""); setOriginalSaleAt(localDateTimeValue()); await load(outletId, true);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to record sale." }); }
    finally { setWorking(false); }
  }

  async function saveMixing() {
    if (!mixMenuId) {
      setNotice({ kind: "error", text: "Select an output menu product." });
      return;
    }
    const outputQty = Number(mixOutputQty);
    if (!Number.isSafeInteger(outputQty) || outputQty < 1) {
      setNotice({ kind: "error", text: "Enter a valid output quantity (at least 1)." });
      return;
    }
    if (!activeMixIngredients.length) {
      setNotice({ kind: "error", text: "Select at least one ingredient." });
      return;
    }
    for (const item of activeMixIngredients) {
      if (!validIngredientQuantity(item.quantity, item.unitLabel)) {
        setNotice({
          kind: "error",
          text: `Invalid quantity for ${item.productName}. Pieces and heads must be whole numbers.`,
        });
        return;
      }
      if (item.quantity > item.available) {
        setNotice({
          kind: "error",
          text: `${item.productName} has only ${item.available} ${item.unitLabel.toLowerCase()} available.`,
        });
        return;
      }
    }

    setWorking(true);
    setNotice(null);
    try {
      const response = await fetch("/api/pos/mixing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outletId,
          sources: activeMixIngredients.map((item) => ({
            inventoryId: item.inventoryId,
            quantity: item.quantity,
          })),
          menuItemId: mixMenuId,
          outputQty,
          remarks: mixRemarks,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to save product mixing.");
      setNotice({ kind: "ok", text: payload.message });
      setMixingOpen(false);
      setMixMenuId("");
      setMixOutputQty("1");
      setMixRemarks("");
      setMixRows([{ inventoryId: "", quantity: "1" }]);
      await load(outletId, true);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to save product mixing." });
    } finally {
      setWorking(false);
    }
  }

  async function menuChanged(removedId?: string) {
    if (removedId) {
      setCart(current => { const next = { ...current }; delete next[removedId]; return next; });
      if (selectedMenuId === removedId) setSelectedMenuId("");
      if (mixMenuId === removedId) setMixMenuId("");
    }
    await load(outletId, true);
  }

  const loadIncoming = useCallback(async () => {
    setIncomingOpen(true); setIncomingLoading(true); setNotice(null);
    try {
      const response = await fetch(`/api/pos/transfers?outletId=${encodeURIComponent(outletId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load incoming deliveries.");
      setIncoming(payload.data || []);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to load incoming deliveries." }); }
    finally { setIncomingLoading(false); }
  }, [outletId, setIncomingOpen, setIncomingLoading, setNotice, setIncoming]);

  useEffect(() => {
    if (view === "deliveries" && outletId) void loadIncoming();
  }, [view, outletId, loadIncoming]);

  async function receiveTransfer(transferId: string, itemId?: string, action?: "ACCEPT" | "REJECT", reason?: string) {
    if (receivingDelivery.current) return;
    receivingDelivery.current = true;
    setWorking(true); setNotice(null);
    try {
      const response = await fetch(`/api/pos/transfers/${transferId}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outletId, itemId, action, reason }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to receive delivery.");
      await Promise.all([loadIncoming(), load(outletId, true)]);
      setNotice({ kind: "ok", text: payload.message });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to receive delivery." }); }
    finally { receivingDelivery.current = false; setWorking(false); }
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
  if (!data) return <section className="space-y-4 rounded-xl border bg-white p-6"><Button variant="outline" asChild><Link href="/pos">Back to Outlets</Link></Button><p role="alert" className="text-red-700">{notice?.text || "Unable to open this outlet."}</p><Button onClick={() => void load(initialOutletId)}>Retry</Button></section>;
  return <main className="min-h-screen bg-slate-50 p-3 lg:p-4">
    <div className="mx-auto max-w-[1920px] space-y-3">
      <header className="rounded-xl border bg-white text-slate-900">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b p-4">
          <div className="space-y-2"><Link href="/pos" className="text-sm text-blue-700 hover:underline">← All Outlets</Link><h1 className="text-xl font-semibold">{outletName}</h1><p className="text-sm text-slate-500">{data.outlets.find(outlet => outlet.id === outletId)?.code}</p></div>
          <time className="pb-2 text-sm text-slate-500">{data?.dailyReport?.date ? new Date(data.dailyReport.date).toLocaleDateString("en-PH", { dateStyle: "long" }) : ""}</time>
        </div>
        <nav aria-label="Outlet transaction actions" className="flex flex-wrap gap-2 p-3">
          <Button type="button" variant={view === "deliveries" ? "default" : "outline"} asChild><Link href={`/pos/outlets/${outletId}/deliveries`}><PackageCheck className="mr-2 size-4" />Receive Deliveries</Link></Button>
          <Button type="button" variant={view === "sales" ? "default" : "outline"} asChild><Link href={`/pos/outlets/${outletId}`}>Sales Entries</Link></Button>
          <Button type="button" variant={view === "mixing" ? "default" : "outline"} asChild><Link href={`/pos/outlets/${outletId}/mixing`}><Blend className="mr-2 size-4" />Production / Mixing</Link></Button>
          <Button type="button" variant={view === "expenses" ? "default" : "outline"} asChild><Link href={`/pos/outlets/${outletId}/expenses`}><ReceiptText className="mr-2 size-4" />Expenses</Link></Button>
          <Button type="button" variant={view === "inventory" ? "default" : "outline"} asChild><Link href={`/pos/outlets/${outletId}/inventory`}><Warehouse className="mr-2 size-4" />Inventory</Link></Button>
          <Button type="button" variant={view === "stock-control" ? "default" : "outline"} disabled={!outletId} asChild><Link href={`/pos/outlets/${outletId}/stock-control`}><ArrowDownToLine className="mr-2 size-4" />Stock Adjustments &amp; Returns</Link></Button>
          <Button type="button" variant="outline" disabled={!outletId} onClick={() => setMenuSetupOpen(true)}><BookOpen className="mr-2 size-4" />Menu Setup</Button>
          <Button type="button" variant={view === "reports" ? "default" : "outline"} asChild><Link href={`/pos/outlets/${outletId}/reports`}><FileText className="mr-2 size-4" />Reports</Link></Button>
        </nav>
      </header>
      {notice && <div className={`flex items-center justify-between rounded-2xl px-4 py-3 font-semibold ${notice.kind === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}><span className="flex items-center gap-2">{notice.kind === "ok" ? <CheckCircle2 className="size-5" /> : <X className="size-5" />}{notice.text}</span><button onClick={() => setNotice(null)}><X className="size-4" /></button></div>}
      {view === "sales" && <>
      {!data?.outlets.length ? <section className="rounded-3xl bg-white p-12 text-center shadow"><Store className="mx-auto mb-3 size-10 text-slate-400" /><h2 className="text-xl font-bold">No outlet assigned</h2><p className="mt-2 text-slate-500">Ask the administrator to assign your account to an active outlet.</p></section> : <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-end gap-3 border-b px-4 py-3"><Button type="button" className="h-10 bg-[#d71920] px-4 font-semibold hover:bg-red-700" disabled={!outletId} onClick={() => { setCashReceived(""); setSaleEntryOpen(true); }}><Plus className="mr-2" />Add Sale</Button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-100 text-slate-700"><tr><th className="px-4 py-3 text-left">Time</th><th className="px-4 py-3 text-left">Receipt</th><th className="px-4 py-3 text-center">Quantity</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{data.dailyReport.transactions.map((sale) => <tr key={sale.id} className="border-b"><td className="px-4 py-3">{new Date(sale.saleDate).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</td><td className="px-4 py-3 font-bold">{sale.receiptNumber}<p className="text-xs text-slate-500">{sale.paymentMethod}</p></td><td className="px-4 py-3 text-center">{sale.totalQty}</td><td className="px-4 py-3 text-right font-semibold">{money.format(sale.totalAmount)}</td></tr>)}{!data.dailyReport.transactions.length && <tr><td colSpan={4} className="py-10 text-center text-slate-500">No sales entries. Select Add Sale to record a transaction.</td></tr>}</tbody><tfoot className="bg-slate-100 font-semibold"><tr><td className="px-4 py-3" colSpan={2}>TOTAL ({data.dailyReport.transactions.length})</td><td className="px-4 py-3 text-center">{data.dailyReport.transactions.reduce((sum, sale) => sum + sale.totalQty, 0)}</td><td className="px-4 py-3 text-right">{money.format(data.dailyReport.revenue)}</td></tr></tfoot></table></div>
      </section>}
      </>}
      {view === "expenses" && <OutletExpensesDialog pageMode outletId={outletId} outletName={outletName} inventory={data.inventory} onClose={() => {}} onUpdated={() => load(outletId, true)} />}
      {view === "inventory" && <OutletInventoryDialog pageMode outletId={outletId} outletName={outletName} items={data.inventory} canManage={data.canManageInventory === true} onClose={() => {}} onUpdated={() => load(outletId, true)} />}
      {view === "deliveries" && <IncomingDeliveriesDialog pageMode outletName={outletName} deliveries={incoming} loading={incomingLoading} working={working} notice={null} onClose={() => {}} onRefresh={() => void loadIncoming()} onReceive={(id, itemId, action, reason) => void receiveTransfer(id, itemId, action, reason)} />}
      {view === "reports" && <OutletReportsPage outletId={outletId} outletName={outletName} />}
      {view === "stock-control" && <OutletStockControlPage key={outletId} outletId={outletId} embedded />}
    </div>
    {saleEntryOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <section data-entry-shell role="dialog" aria-modal="true" aria-labelledby="outlet-sale-title" className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4">
          <div><h2 id="outlet-sale-title" className="text-xl font-semibold">Record Outlet Sales</h2><p className="mt-1 text-sm text-slate-500">{outletName}</p></div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close sales entry" disabled={working} onClick={() => setSaleEntryOpen(false)}><X className="size-5" /></Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {notice?.kind === "error" && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{notice.text}</p>}
          <div className="flex flex-wrap items-end justify-between gap-3"><label className="block text-sm font-medium">Entry type<select className="mt-1 h-10 w-full rounded-md border px-3 sm:w-80" value={entryMode} onChange={event => setEntryMode(event.target.value as "TRANSACTION" | "DAILY_TOTAL")}><option value="TRANSACTION">Customer transaction</option><option value="DAILY_TOTAL">Daily sales totals</option></select></label><p className="text-sm text-slate-500">{rows.length} products · Stock deducts on save</p></div>

          <div className="grid items-end gap-3 border-b pb-4 md:grid-cols-[1fr_120px_auto]">
            <label className="text-sm font-medium">Product
              <div className="relative mt-1">
                <Search className="absolute left-3 top-3 z-10 size-4 text-slate-400" />
                <Input
                  aria-label="Search outlet product" className="h-10 pl-10"
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
            <label className="text-sm font-medium">Quantity<Input aria-label="Product quantity" className="mt-1 h-10 text-center" type="number" min="1" step="1" value={lineQty} onChange={(e) => setLineQty(e.target.value)} /></label>
            <Button type="button" disabled={working || !selectedMenuId} className="h-10 self-end" onClick={addSelectedProduct}><Plus className="mr-2 size-4" />Add</Button>
          </div>
          <div className="overflow-hidden rounded-lg border"><div className="max-h-[38dvh] overflow-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-700"><tr><th className="p-3 text-left">Product</th><th className="p-3 text-center">Qty</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Subtotal</th><th className="w-24 p-3 text-center">Action</th></tr></thead>
              <tbody>{saleItemsPagination.rows.map((item) => <tr key={item.id} className="border-b"><td className="p-3"><b>{item.name}</b><p className="text-xs text-slate-500">{item.category}</p></td><td className="p-3"><Input aria-label={`Quantity for ${item.name}`} disabled={working} className="mx-auto h-9 w-24 text-center" type="number" min="1" max={item.stockQty} value={item.qty} onChange={(e) => setQty(item, Number(e.target.value))} /></td><td className="p-3 text-right">{money.format(item.price)}</td><td className="p-3 text-right font-semibold">{money.format(item.price * item.qty)}</td><td className="p-3"><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${item.name}`} disabled={working} className="text-red-600" onClick={() => setQty(item, 0)}><Trash2 className="size-4" /></Button></td></tr>)}{!rows.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Add at least one outlet product.</td></tr>}</tbody>
            <tfoot className="border-t-2 bg-slate-100 font-semibold"><tr><td className="p-3">TOTAL ({rows.length} products)</td><td className="p-3 text-center">{rows.reduce((sum, item) => sum + item.qty, 0)}</td><td /><td className="p-3 text-right">{money.format(total)}</td><td /></tr></tfoot></table></div><TablePagination {...saleItemsPagination} disabled={working} onPageChange={setSaleItemsPage} onPageSizeChange={size => { setSaleItemsPageSize(size); setSaleItemsPage(1); }} />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" disabled={working} checked={lateEntry} onChange={(e) => setLateEntry(e.target.checked)} />Late sales entry</label>
              {lateEntry && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Transaction date and time<Input disabled={working} className="mt-1 h-10" type="datetime-local" value={originalSaleAt} onChange={(e) => setOriginalSaleAt(e.target.value)} /></label><label className="text-sm">Reason<Input disabled={working} className="mt-1 h-10" minLength={3} maxLength={200} value={lateEntryReason} onChange={(e) => setLateEntryReason(e.target.value)} /></label></div>}
              <p className="text-xs text-slate-500">Enter completed sales once. Do not repeat transactions already recorded.</p>
            </div>
            <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
              <label className="block text-sm font-medium">Payment<select className="mt-1 h-10 w-full rounded-md border bg-white px-3" disabled={working} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="CASH">Cash</option><option value="CREDIT">Employee Credit</option></select></label>
              {paymentMethod === "CREDIT" ? <label className="block text-sm font-medium">Employee<select className="mt-1 h-10 w-full rounded-md border bg-white px-3" disabled={working} value={employeeAccountId} onChange={e => setEmployeeAccountId(e.target.value)}><option value="">Select employee</option>{employees.map(e => <option key={e._id} value={e._id}>{e.code} — {e.name}</option>)}</select><span className="text-xs text-slate-500">Collect through Payment → Employee Credits.</span></label> : <><label className="block text-sm font-medium">Cash collected<Input disabled={working} className="mt-1 h-10 bg-white text-right" type="number" min={total} step="0.01" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} /></label><div className="flex justify-between text-sm"><span>Change / excess cash</span><strong>{money.format(Math.max(0, cash - total))}</strong></div></>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t bg-white px-5 py-4"><div className="mr-auto"><span className="mr-2 text-sm text-slate-500">Total</span><strong className="text-xl">{money.format(total)}</strong></div><Button variant="outline" disabled={working} onClick={() => setSaleEntryOpen(false)}>Cancel</Button><Button className="min-w-28" disabled={working || !rows.length || (paymentMethod === "CREDIT" ? !employeeAccountId : cash < total) || (lateEntry && (!originalSaleAt || lateEntryReason.trim().length < 3))} onClick={() => void checkout()}>{working && <Loader2 className="mr-2 animate-spin" />}Save Sale</Button></div>
      </section>
    </div>}
    {expensesOpen && <OutletExpensesDialog outletId={outletId} outletName={outletName} inventory={data?.inventory || []} onClose={() => setExpensesOpen(false)} onUpdated={() => load(outletId, true)} />}
    {view !== "deliveries" && incomingOpen && <IncomingDeliveriesDialog outletName={outletName} deliveries={incoming} loading={incomingLoading} working={working} notice={notice} onClose={() => setIncomingOpen(false)} onRefresh={() => void loadIncoming()} onReceive={(id, itemId, action, reason) => void receiveTransfer(id, itemId, action, reason)} />}
    {deductionOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"><section data-entry-shell className="w-full max-w-2xl rounded-[30px] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-[#d71920]">Outlet Inventory</p><h2 className="text-2xl font-black">Manual Stock Deduction</h2></div><button onClick={() => setDeductionOpen(false)}><X /></button></div><div className="mt-6 grid gap-4 md:grid-cols-2"><label className="text-sm font-bold md:col-span-2">Product<select className="mt-1 h-12 w-full rounded-xl border px-3" value={deductInventoryId} onChange={(e) => { const item = data?.inventory.find((x) => x.id === e.target.value); setDeductInventoryId(e.target.value); setDeductUnit(item?.packSize ? "PACK" : item?.unitLabel || "PCS"); }}><option value="">Select stock...</option>{(data?.inventory || []).filter((x) => x.stockQty > 0).map((x) => <option key={x.id} value={x.id}>{x.productName} — {stockLabel(x)}</option>)}</select></label><label className="text-sm font-bold">Quantity<Input className="mt-1 h-12" type="number" min="1" step="1" value={deductQty} onChange={(e) => setDeductQty(e.target.value)} /></label><label className="text-sm font-bold">Unit<select className="mt-1 h-12 w-full rounded-xl border px-3" value={deductUnit} onChange={(e) => setDeductUnit(e.target.value)}>{(() => { const item = data?.inventory.find((x) => x.id === deductInventoryId); return item?.packSize ? <><option value="PACK">Pack</option><option value="PCS">PCS</option></> : <option value={item?.unitLabel || "PCS"}>{item?.unitLabel || "PCS"}</option>; })()}</select></label><label className="text-sm font-bold md:col-span-2">Reason / remarks<Input className="mt-1 h-12" minLength={3} maxLength={250} placeholder="Required audit reason" value={deductRemarks} onChange={(e) => setDeductRemarks(e.target.value)} /></label></div><div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={() => setDeductionOpen(false)}>Cancel</Button><Button className="bg-[#d71920] font-black" disabled={working || !deductInventoryId || Number(deductQty) < 1 || deductRemarks.trim().length < 3} onClick={() => void saveDeduction()}>{working && <Loader2 className="mr-2 animate-spin" />}Save Deduction</Button></div></section></div>}
    {stockOpen && <OutletInventoryDialog outletId={outletId} outletName={outletName} items={data?.inventory || []} canManage={data?.canManageInventory === true} onClose={() => setStockOpen(false)} onUpdated={() => load(outletId, true)} />}
    {menuSetupOpen && <OutletMenuDialog outletId={outletId} outletName={outletName} onClose={() => setMenuSetupOpen(false)} onUpdated={menuChanged} />}
    <Dialog pageMode={view === "mixing"} open={view === "mixing" || mixingOpen} onOpenChange={setMixingOpen}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {view !== "mixing" && <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="text-xl font-bold">Product Mixing</DialogTitle>
          <DialogDescription className="sr-only">
            Combine ingredients into a sellable product.
          </DialogDescription>
        </DialogHeader>}

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {notice?.kind === "error" && (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
              {notice.text}
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm font-medium">
              <span>Output Menu Product *</span>
              <MixingOutputPicker
                menu={data?.menu || []}
                value={mixMenuId}
                onSelect={setMixMenuId}
                disabled={working}
              />
            </label>

            <label className="space-y-1 text-sm font-medium">
              <span>Output Quantity *</span>
              <Input
                type="number"
                min="1"
                step="1"
                value={mixOutputQty}
                onChange={(event) => setMixOutputQty(event.target.value)}
                disabled={working}
                className="h-10"
              />
            </label>

            <label className="space-y-1 text-sm font-medium">
              <span>Remarks</span>
              <Input
                value={mixRemarks}
                onChange={(event) => setMixRemarks(event.target.value)}
                placeholder="Optional"
                disabled={working}
                className="h-10"
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_40px] gap-3 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 md:grid"
            >
              <span>Product</span>
              <span className="text-center">Unit Cost</span>
              <span className="text-center">Qty</span>
              <span className="text-center">Subtotal</span>
              <span />
            </div>
            <div className="divide-y">
              {mixRows.map((row, index) => {
                const source = data?.inventory.find((it) => it.id === row.inventoryId);
                const qty = Number(row.quantity) || 0;
                const unitCost = Number(source?.buyingPrice || 0);
                const subtotal = Math.round(unitCost * qty * 100) / 100;
                const excludedSet = new Set(mixRows.map((r) => r.inventoryId).filter(Boolean));

                return (
                  <div
                    key={index}
                    className="grid items-end gap-3 p-3 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_40px]"
                  >
                    <div className="min-w-0">
                      <span className="mb-1 block text-xs font-medium md:sr-only">Product</span>
                      <MixingIngredientPicker
                        inventory={data?.inventory || []}
                        value={row.inventoryId}
                        disabled={working}
                        excludedIds={excludedSet}
                        onSelect={(id) => updateMixRow(index, "inventoryId", id)}
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="mb-1 block text-xs font-medium md:sr-only">Unit Cost</span>
                      <div className="flex h-10 items-center justify-center rounded-lg border bg-slate-50/60 px-2 text-sm font-medium text-slate-700">
                        {source ? money.format(unitCost) : "0"}
                      </div>
                    </div>
                    <label className="min-w-0">
                      <span className="mb-1 block text-xs font-medium md:sr-only">Qty</span>
                      <Input
                        aria-label={`Quantity for product ${index + 1}`}
                        type="number"
                        min="0.0001"
                        step="any"
                        value={row.quantity}
                        onChange={(event) => updateMixRow(index, "quantity", event.target.value)}
                        className="h-10 text-center"
                        disabled={working}
                      />
                    </label>
                    <div className="min-w-0">
                      <span className="mb-1 block text-xs font-medium md:sr-only">Subtotal</span>
                      <output
                        aria-label={`Subtotal for product ${index + 1}`}
                        className="flex h-10 items-center justify-center rounded-lg bg-slate-50 px-2 text-sm font-semibold tabular-nums"
                      >
                        {money.format(subtotal)}
                      </output>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove product ${index + 1}`}
                      disabled={working || mixRows.length <= 1}
                      onClick={() => removeMixRow(index)}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={addMixRow}
            disabled={working}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 items-center gap-3 rounded-none bg-white px-5 py-4 sm:justify-between border-t">
          <div aria-live="polite" className="mr-auto flex items-baseline gap-3">
            <span className="text-sm text-slate-500">Total</span>
            <strong className="text-2xl font-bold tabular-nums">
              {money.format(mixSummary.totalBatch)}
            </strong>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={() => view === "mixing" ? router.push(`/pos/outlets/${outletId}`) : setMixingOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                working ||
                !activeMixIngredients.length ||
                !mixMenuId ||
                !mixSummary.hasProdCost ||
                !Number.isSafeInteger(Number(mixOutputQty)) ||
                Number(mixOutputQty) < 1
              }
              onClick={() => void saveMixing()}
              className="min-w-28 flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {working ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {reportOpen && data?.dailyReport && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"><section className="w-full max-w-7xl overflow-hidden rounded-[30px] bg-white shadow-2xl"><div className="flex items-center justify-between bg-[#1b1b1b] px-6 py-5 text-white"><div><p className="text-xs font-black uppercase tracking-widest text-[#ffbc0d]">{outletName}</p><h2 className="text-2xl font-black">Outlet Daily Review</h2></div><button onClick={() => setReportOpen(false)}><X /></button></div><div className="pos-daily-report max-h-[75vh] overflow-y-auto p-6"><div className="text-center"><h2 className="text-xl font-black">ISAY FRIED CHICKEN</h2><p>{outletName}</p><p className="text-sm text-slate-500">Outlet Daily Review · {new Date(data.dailyReport.date).toLocaleDateString("en-PH")}</p></div><div className="mt-6 overflow-x-auto rounded-xl border"><table className="w-full min-w-[980px] text-sm"><thead><tr className="bg-slate-100"><th className="p-3 text-left">Date / Time</th><th className="p-3 text-left">Receipt</th><th className="p-3 text-center">Qty</th><th className="p-3 text-right">Sales</th><th className="p-3 text-right">COGS</th><th className="p-3 text-right">Gross Profit</th><th className="p-3 text-right">Expenses</th><th className="p-3 text-right">Net Profit</th></tr></thead><tbody>{data.dailyReport.transactions.map((sale) => <tr key={sale.id} className="border-t"><td className="p-3">{new Date(sale.saleDate).toLocaleString("en-PH", { dateStyle: "short", timeStyle: "short" })}</td><td className="p-3 font-semibold">{sale.receiptNumber}<p className="text-xs text-slate-500">{sale.paymentMethod}</p></td><td className="p-3 text-center">{sale.totalQty}</td><td className="p-3 text-right">{money.format(sale.totalAmount)}</td><td className="p-3 text-right">{money.format(sale.cogs)}</td><td className="p-3 text-right font-semibold">{money.format(sale.grossProfit)}</td><td className="p-3 text-center text-slate-400">—</td><td className="p-3 text-center text-slate-400">—</td></tr>)}{!data.dailyReport.transactions.length && <tr><td colSpan={8} className="p-10 text-center text-slate-500">No outlet sales entries for this date.</td></tr>}</tbody><tfoot><tr className="border-t-2 bg-slate-100 font-black"><td className="p-3" colSpan={2}>TOTAL ({data.dailyReport.transactions.length})</td><td className="p-3 text-center">{data.dailyReport.transactions.reduce((sum, sale) => sum + sale.totalQty, 0)}</td><td className="p-3 text-right">{money.format(data.dailyReport.revenue)}</td><td className="p-3 text-right">{money.format(data.dailyReport.cogs)}</td><td className="p-3 text-right">{money.format(data.dailyReport.grossProfit)}</td><td className="p-3 text-right">
  <div>{money.format(data.dailyReport.expenses)}</div>
  {(data.dailyReport.cashSaleExpenses !== undefined || data.dailyReport.periodExpenses !== undefined) && (
    <div className="text-[10px] font-normal text-slate-500">
      Drawer: {money.format(data.dailyReport.cashSaleExpenses || 0)} · Period: {money.format(data.dailyReport.periodExpenses || 0)}
    </div>
  )}
</td><td className={`p-3 text-right ${data.dailyReport.netProfit < 0 ? "text-red-600" : "text-emerald-700"}`}>{money.format(data.dailyReport.netProfit)}</td></tr></tfoot></table></div><section className="mt-5"><h3 className="mb-2 font-black">Cash movement (separate from profit)</h3><table className="w-full text-sm"><tbody>{[["Cash sales", data.dailyReport.cash.cashSales], ["Less: cash expenses (drawer deductions)", -data.dailyReport.cash.expenses], ["NET CASH MOVEMENT (excludes opening cash / remittances)", data.dailyReport.cash.netCashMovement]].map(([label, value]) => <tr key={label} className="border-b last:bg-slate-100 last:font-black"><td className="p-3">{label}</td><td className="p-3 text-right">{money.format(Number(value))}</td></tr>)}</tbody></table></section><p className="mt-3 text-xs text-slate-500">Cash movement reflects only cash paid from the register drawer. Period overhead (electricity, rent, salaries, mixing supplies) is deducted from net profit only.</p></div><div className="flex justify-end gap-3 border-t p-4"><Button variant="outline" onClick={() => setReportOpen(false)}>Close</Button><Button className="bg-[#1b1b1b] font-black" onClick={() => window.print()}><Printer className="mr-2" />Print Daily Review</Button></div></section></div>}
    {receipt && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3">
      <section className="w-full max-w-md rounded-[30px] bg-white p-5 text-center">
        <CheckCircle2 className="mx-auto size-16 text-emerald-600" />
        <h2 className="text-2xl font-black">Sale Saved</h2>
        <p className="text-slate-500">{receipt.receiptNumber}{receipt.isLateEntry ? " · Late entry" : ""}</p>
        <div className="pos-receipt mt-5 rounded-2xl border border-dashed p-5 text-left">
          <div className="text-center"><h3 className="font-black">ISAY FRIED CHICKEN</h3><p className="text-xs">{receipt.outletName}</p><p className="text-xs">{receipt.receiptNumber} · {new Date(receipt.saleDate).toLocaleString("en-PH")}</p></div>
          <div className="my-4 border-t border-dashed" />
          {receipt.items.map((item) => <div key={item.id} className="flex justify-between text-sm"><span>{item.qty} x {item.name}</span><b>{money.format(item.qty * item.price)}</b></div>)}
          <div className="mt-3 border-t border-dashed pt-3"><div className="flex justify-between text-lg font-black"><span>TOTAL</span><span>{money.format(receipt.total)}</span></div>{receipt.paymentMethod === "CREDIT" ? <p className="text-sm">Employee Credit — {receipt.employeeName} · Amount owed {money.format(receipt.total)}</p> : <><div className="flex justify-between text-sm"><span>Cash</span><span>{money.format(receipt.cash)}</span></div><div className="flex justify-between text-sm"><span>Change</span><span>{money.format(receipt.change)}</span></div></>}</div>
          <p className="mt-5 text-center text-xs">Thank you! Please come again.</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><Button type="button" variant="outline" onClick={() => setReceipt(null)}>Close</Button><Button type="button" variant="outline" onClick={() => window.print()}><Printer className="mr-2" />Print</Button><Button type="button" className="bg-[#d71920] font-black" onClick={() => { setReceipt(null); setCashReceived(""); setSaleEntryOpen(true); }}>Add Another Sale</Button></div>
      </section>
    </div>}
    <style jsx global>{`[data-entry-shell] { display:flex;flex-direction:column;max-height:90dvh;overflow:hidden;padding:0 }
      [data-entry-shell] > div:first-child { flex-shrink:0;padding:1rem 1.25rem }
      [data-entry-shell] > div:last-child { flex-shrink:0;margin-top:0;padding:1rem 1.25rem }
      [data-entry-shell] > div:not(:first-child):not(:last-child) { min-height:0;flex:1 1 auto;overflow-y:auto;padding:1rem 1.25rem }
      @media print { body * { visibility:hidden!important } .pos-receipt,.pos-receipt *,.pos-daily-report,.pos-daily-report *,.pos-outlet-report,.pos-outlet-report * { visibility:visible!important } .pos-receipt { position:absolute!important;left:0;top:0;width:80mm;border:0!important } .pos-daily-report,.pos-outlet-report { position:absolute!important;left:0;top:0;width:100%!important;max-height:none!important;overflow:visible!important;padding:12mm!important } .pos-outlet-report { border:0!important;border-radius:0!important } .pos-outlet-report .overflow-x-auto { overflow:visible!important } .pos-outlet-report thead { display:table-header-group } .pos-outlet-report tr { break-inside:avoid } .pos-outlet-report th,.pos-outlet-report td { padding:6px!important;font-size:10px } }`}</style>
  </main>;
}
