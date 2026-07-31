"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ProductType = "ALL" | "CHICKEN" | "GROCERY";

type MovementRow = {
  key: string;
  productType: "CHICKEN" | "GROCERY";
  product: string;
  category: string;
  stockIn: number;
  stockOut: number;
  current: number;
  bagsIn: number;
  bagsOut: number;
  bagsCurrent: number;
  kilosIn: number;
  kilosOut: number;
  kilosCurrent: number;
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function format(value: number, digits = 0) {
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function InventoryMovementsByTypePageClient() {
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [productType, setProductType] = useState<ProductType>("ALL");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState({ productType: "ALL" as ProductType, search: "", dateFrom: "", dateTo: "" });
  const [isLoading, setIsLoading] = useState(true);

  async function loadGrocery() {
    const all: any[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const params = new URLSearchParams({ page: String(page), limit: "100" });
      if (applied.search) params.set("search", applied.search);
      if (applied.dateFrom) params.set("dateFrom", applied.dateFrom);
      if (applied.dateTo) params.set("dateTo", applied.dateTo);
      const res = await fetch(`/api/inventory/products?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load grocery movements.");
      all.push(...(json.data || []));
      totalPages = Number(json.meta?.totalPages || 1);
      page += 1;
    } while (page <= totalPages);
    return all.map((item): MovementRow => ({
      key: `GROCERY:${item._id}`,
      productType: "GROCERY",
      product: item.name,
      category: item.categoryName || "-",
      stockIn: numberValue(item.stockInPcs),
      stockOut: numberValue(item.stockOutPcs),
      current: numberValue(item.stockPcs),
      bagsIn: numberValue(item.stockInBags),
      bagsOut: numberValue(item.stockOutBags),
      bagsCurrent: numberValue(item.stockBags),
      kilosIn: numberValue(item.stockInKilos),
      kilosOut: numberValue(item.stockOutKilos),
      kilosCurrent: numberValue(item.stockKilos),
    }));
  }

  async function loadChicken() {
    const params = new URLSearchParams();
    if (applied.search) params.set("search", applied.search);
    if (applied.dateFrom) params.set("dateFrom", applied.dateFrom);
    if (applied.dateTo) params.set("dateTo", applied.dateTo);
    const res = await fetch(`/api/inventory/bodega?${params.toString()}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || "Failed to load chicken movements.");
    return (json.data || []).map((item: any): MovementRow => ({
      key: `CHICKEN:${item._id}`,
      productType: "CHICKEN",
      product: item.product,
      category: "CHICKEN",
      stockIn: numberValue(item.stockInPcs ?? item.stockIn),
      stockOut: numberValue(item.stockOutPcs ?? item.stockOut),
      current: numberValue(item.currentStockPcs ?? item.currentStock),
      bagsIn: numberValue(item.stockInBags ?? item.stockInPacks),
      bagsOut: numberValue(item.stockOutBags ?? item.stockOutPacks),
      bagsCurrent: numberValue(item.currentBags ?? item.currentStockPacks),
      kilosIn: numberValue(item.stockInKilos),
      kilosOut: numberValue(item.stockOutKilos),
      kilosCurrent: numberValue(item.currentKilos),
    }));
  }

  async function loadData() {
    setIsLoading(true);
    try {
      const loaders: Promise<MovementRow[]>[] = [];
      if (applied.productType !== "GROCERY") loaders.push(loadChicken());
      if (applied.productType !== "CHICKEN") loaders.push(loadGrocery());
      const data = (await Promise.all(loaders)).flat().sort((a, b) => a.product.localeCompare(b.product));
      setRows(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load inventory movements.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // Reload only after the user applies or resets the filter set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  function applyFilters() {
    setApplied({ productType, search: search.trim(), dateFrom, dateTo });
  }

  function resetFilters() {
    setProductType("ALL"); setSearch(""); setDateFrom(""); setDateTo("");
    setApplied({ productType: "ALL", search: "", dateFrom: "", dateTo: "" });
  }

  return (
    <div className="space-y-5">
      <div><h1 className="text-3xl font-bold tracking-tight">Inventory Movements by Product Type</h1><p className="text-sm text-muted-foreground">Monitor stock in, stock out, and current balances for chicken and grocery products.</p></div>
      <Card><CardContent className="grid items-end gap-3 p-5 lg:grid-cols-[180px_1fr_220px_220px_auto_auto]">
        <div className="space-y-2"><Label>Product Type</Label><Select value={productType} onValueChange={(value) => setProductType(value as ProductType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All products</SelectItem><SelectItem value="CHICKEN">Chicken</SelectItem><SelectItem value="GROCERY">Grocery</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>Search Product</Label><Input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyFilters(); }} placeholder="Search product..." /></div>
        <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
        <div className="space-y-2"><Label>End Date</Label><Input type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
        <Button onClick={applyFilters}><Search className="mr-2 h-4 w-4" />Search</Button><Button variant="secondary" onClick={resetFilters}><RefreshCcw className="mr-2 h-4 w-4" />Reset</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{rows.length.toLocaleString()} products</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead rowSpan={2}>Type</TableHead><TableHead rowSpan={2}>Product</TableHead><TableHead rowSpan={2}>Category</TableHead><TableHead colSpan={3} className="bg-emerald-600 text-center text-white">IN</TableHead><TableHead colSpan={3} className="bg-rose-500 text-center text-white">OUT</TableHead><TableHead colSpan={3} className="bg-blue-500 text-center text-white">CURRENT</TableHead></TableRow><TableRow>{["Qty/PCS", "Bags/Packs", "Kilos", "Qty/PCS", "Bags/Packs", "Kilos", "Qty/PCS", "Bags/Packs", "Kilos"].map((label, index) => <TableHead key={`${label}-${index}`} className="text-right">{label}</TableHead>)}</TableRow></TableHeader><TableBody>
        {isLoading ? <TableRow><TableCell colSpan={12} className="h-40 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={12} className="h-40 text-center text-muted-foreground">No inventory movements found.</TableCell></TableRow> : rows.map((row) => <TableRow key={row.key}><TableCell className="font-medium">{row.productType === "CHICKEN" ? "Chicken" : "Grocery"}</TableCell><TableCell className="font-semibold">{row.product}</TableCell><TableCell>{row.category}</TableCell><TableCell className="text-right text-emerald-700">{format(row.stockIn)}</TableCell><TableCell className="text-right text-emerald-700">{format(row.bagsIn)}</TableCell><TableCell className="text-right text-emerald-700">{format(row.kilosIn, 2)}</TableCell><TableCell className="text-right text-rose-600">{format(row.stockOut)}</TableCell><TableCell className="text-right text-rose-600">{format(row.bagsOut)}</TableCell><TableCell className="text-right text-rose-600">{format(row.kilosOut, 2)}</TableCell><TableCell className="text-right font-semibold">{format(row.current)}</TableCell><TableCell className="text-right">{format(row.bagsCurrent)}</TableCell><TableCell className="text-right">{format(row.kilosCurrent, 2)}</TableCell></TableRow>)}
      </TableBody></Table></div></CardContent></Card>
    </div>
  );
}
