"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Boxes,
  Eye,
  Loader2,
  RefreshCcw,
  Save,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type CategoryOption = {
  _id: string;
  name: string;
};

type ProductInventoryItem = {
  _id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  buyingPrice: number;
  unitPrice: number;
  stockPcs: number;
  stockBags: number;
  stockKilos: number;
  stockInPcs: number;
  stockOutPcs: number;
  stockInBags: number;
  stockOutBags: number;
  stockInKilos: number;
  stockOutKilos: number;
  lowStockAlert: number;
  isLowStock: boolean;
  estimatedCostValue: number;
  estimatedSellingValue: number;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type StockAction = "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";
type StockUnit = "PCS" | "BAGS" | "KILOS";

const emptyForm = {
  name: "",
  categoryId: "",
  buyingPrice: "0",
  unitPrice: "0",
  stockPcs: "0",
  stockBags: "0",
  stockKilos: "0",
  lowStockAlert: "0",
};

const emptyStockForm = {
  action: "STOCK_IN" as StockAction,
  unit: "PCS" as StockUnit,
  quantity: "0",
  newStock: "0",
  remarks: "",
};

function formatNumber(value: number, digits = 0) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function getStockByUnit(product: ProductInventoryItem, unit: StockUnit) {
  if (unit === "BAGS") return product.stockBags;
  if (unit === "KILOS") return product.stockKilos;
  return product.stockPcs;
}

export function ProductInventoryPageClient() {
  const [items, setItems] = useState<ProductInventoryItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [meta, setMeta] = useState<ApiMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState("10");
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [stockStatus, setStockStatus] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [editingItem] = useState<ProductInventoryItem | null>(null);
  const [stockItem] = useState<ProductInventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [stockForm, setStockForm] = useState(emptyStockForm);

  const stockCurrentValue = useMemo(() => {
    if (!stockItem) return 0;
    return getStockByUnit(stockItem, stockForm.unit);
  }, [stockItem, stockForm.unit]);

  async function loadItems() {
    setIsLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      limit,
    });

    if (search) params.set("search", search);
    if (stockStatus !== "ALL") params.set("stockStatus", stockStatus);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    try {
      const res = await fetch(`/api/inventory/products?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load grocery/product inventory.");
      }

      setItems(json.data || []);
      setCategories(json.categoryOptions || []);
      setMeta(
        json.meta || {
          page,
          limit: Number(limit),
          total: 0,
          totalPages: 1,
        }
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load grocery/product inventory."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, stockStatus, dateFrom, dateTo]);

  function updateForm(name: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateStockForm(name: keyof typeof emptyStockForm, value: string) {
    setStockForm((current) => ({ ...current, [name]: value }));
  }

  function applySearch() {
    setSearch(draftSearch.trim());
    setPage(1);
  }

  function resetFilters() {
    setDraftSearch("");
    setSearch("");
    setStockStatus("ALL");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const url = editingItem
        ? `/api/inventory/products/${editingItem._id}`
        : "/api/inventory/products";

      const res = await fetch(url, {
        method: editingItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save product inventory item.");
      }

      toast.success(json.message || "Product inventory item saved successfully.");
      setFormDialogOpen(false);
      await loadItems();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save product inventory item."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stockItem) return;

    setIsSaving(true);

    try {
      const res = await fetch(`/api/inventory/products/${stockItem._id}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stockForm),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to update product stock.");
      }

      toast.success(json.message || "Product stock updated successfully.");
      setStockDialogOpen(false);
      await loadItems();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update product stock.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="grid items-end gap-3 pt-6 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto_auto]">
          <Input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search grocery/product..."
            onKeyDown={(event) => {
              if (event.key === "Enter") applySearch();
            }}
          />

          <Select
            value={stockStatus}
            onValueChange={(value) => {
              setStockStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Stock status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All stock</SelectItem>
              <SelectItem value="LOW">Low stock</SelectItem>
              <SelectItem value="OUT">Out of stock</SelectItem>
            </SelectContent>
          </Select>

          <div className="space-y-1">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="space-y-1">
            <Label>End Date</Label>
            <Input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <Button onClick={applySearch}>
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
          <Button variant="secondary" onClick={resetFilters}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b bg-slate-50/70 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4" />
              Grocery/Product Stock Movement
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Showing {items.length} of {meta.total} records
            </p>
          </div>
          <Select
            value={limit}
            onValueChange={(value) => {
              setLimit(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full md:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 rows</SelectItem>
              <SelectItem value="25">25 rows</SelectItem>
              <SelectItem value="50">50 rows</SelectItem>
              <SelectItem value="100">100 rows</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden overflow-x-auto lg:block">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow>
                  <TableHead rowSpan={2} className="text-white">Product</TableHead>
                  <TableHead rowSpan={2} className="text-white">Category</TableHead>
                  <TableHead colSpan={3} className="bg-emerald-600 text-center text-white">IN</TableHead>
                  <TableHead colSpan={3} className="bg-rose-500 text-center text-white">OUT</TableHead>
                  <TableHead colSpan={3} className="bg-blue-500 text-center text-white">CURRENT</TableHead>
                  <TableHead rowSpan={2} className="text-center text-white">Action</TableHead>
                </TableRow>
                <TableRow>
                  {["PCS", "Bags", "Kilos"].map((label) => (
                    <TableHead key={`in-${label}`} className="text-right text-white">{label}</TableHead>
                  ))}
                  {["PCS", "Bags", "Kilos"].map((label) => (
                    <TableHead key={`out-${label}`} className="text-right text-white">{label}</TableHead>
                  ))}
                  {["PCS", "Bags", "Kilos"].map((label) => (
                    <TableHead key={`current-${label}`} className="text-right text-white">{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-32 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-32 text-center text-muted-foreground">
                      No grocery/product inventory found.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((product) => (
                    <TableRow key={product._id}>
                      <TableCell className="font-bold">{product.name}</TableCell>
                      <TableCell>{product.categoryName || "-"}</TableCell>
                      <TableCell className="text-right text-emerald-700">{formatNumber(product.stockInPcs)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{formatNumber(product.stockInBags)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{formatNumber(product.stockInKilos, 2)}</TableCell>
                      <TableCell className="text-right text-rose-600">{formatNumber(product.stockOutPcs)}</TableCell>
                      <TableCell className="text-right text-rose-600">{formatNumber(product.stockOutBags)}</TableCell>
                      <TableCell className="text-right text-rose-600">{formatNumber(product.stockOutKilos, 2)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatNumber(product.stockPcs)}
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(product.stockBags)}</TableCell>
                      <TableCell className="text-right">{formatNumber(product.stockKilos, 2)}</TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/inventory/products/${product._id}`}>
                              <Eye className="mr-1 h-4 w-4" />
                              View
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 p-4 lg:hidden">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">
                No grocery/product inventory found.
              </div>
            ) : (
              items.map((product) => (
                <div key={product._id} className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div>
                    <p className="text-base font-black">{product.name}</p>
                    <p className="text-sm text-muted-foreground">{product.categoryName || "No category"}</p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-bold text-emerald-700">Stock In</p>
                      <p className="font-bold">
                        {formatNumber(product.stockInPcs)} PCS / {formatNumber(product.stockInBags)} bags / {formatNumber(product.stockInKilos, 2)} kg
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-bold text-rose-600">Stock Out</p>
                      <p className="font-bold">
                        {formatNumber(product.stockOutPcs)} PCS / {formatNumber(product.stockOutBags)} bags / {formatNumber(product.stockOutKilos, 2)} kg
                      </p>
                    </div>
                    <div className="col-span-2 rounded-xl bg-blue-50 p-3">
                      <p className="text-xs font-bold text-blue-700">Current Stock</p>
                      <p className="font-bold">
                        {formatNumber(product.stockPcs)} PCS / {formatNumber(product.stockBags)} bags / {formatNumber(product.stockKilos, 2)} kg
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button size="sm" variant="outline" className="w-full" asChild>
                      <Link href={`/inventory/products/${product._id}`}>
                        <Eye className="mr-1 h-4 w-4" />
                        View Transactions
                      </Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-col gap-3 border-t p-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">
              Page {meta.page} of {meta.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page >= meta.totalPages || isLoading}
                onClick={() => setPage((current) => Math.min(current + 1, meta.totalPages))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Grocery/Product" : "Add Grocery/Product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveProduct} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Product Name</Label>
                <Input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="e.g. RICE, NOODLES, CANNED GOODS"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.categoryId} onValueChange={(value) => updateForm("categoryId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category._id} value={category._id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Buying Price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.buyingPrice}
                  onChange={(event) => updateForm("buyingPrice", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Selling Price / Unit</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unitPrice}
                  onChange={(event) => updateForm("unitPrice", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Stock PCS</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.stockPcs}
                  onChange={(event) => updateForm("stockPcs", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Stock Bags</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.stockBags}
                  onChange={(event) => updateForm("stockBags", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Stock Kilos</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.stockKilos}
                  onChange={(event) => updateForm("stockKilos", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Low Stock Alert PCS</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.lowStockAlert}
                  onChange={(event) => updateForm("lowStockAlert", event.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isSaving} onClick={() => setFormDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Stock: {stockItem?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveStock} className="space-y-4">
            <div className="rounded-xl border bg-slate-50 p-4 text-sm">
              Current selected stock: <span className="font-bold">{formatNumber(stockCurrentValue, stockForm.unit === "KILOS" ? 2 : 0)} {stockForm.unit}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Action</Label>
                <Select
                  value={stockForm.action}
                  onValueChange={(value) => updateStockForm("action", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STOCK_IN">Stock In</SelectItem>
                    <SelectItem value="STOCK_OUT">Stock Out</SelectItem>
                    <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select
                  value={stockForm.unit}
                  onValueChange={(value) => {
                    const nextUnit = value as StockUnit;
                    updateStockForm("unit", nextUnit);
                    if (stockItem) {
                      updateStockForm("newStock", String(getStockByUnit(stockItem, nextUnit)));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PCS">PCS</SelectItem>
                    <SelectItem value="BAGS">BAGS</SelectItem>
                    <SelectItem value="KILOS">KILOS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {stockForm.action === "ADJUSTMENT" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label>New Stock</Label>
                  <Input
                    type="number"
                    min="0"
                    step={stockForm.unit === "KILOS" ? "0.01" : "1"}
                    value={stockForm.newStock}
                    onChange={(event) => updateStockForm("newStock", event.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-2 md:col-span-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    step={stockForm.unit === "KILOS" ? "0.01" : "1"}
                    value={stockForm.quantity}
                    onChange={(event) => updateStockForm("quantity", event.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2 md:col-span-2">
                <Label>Remarks</Label>
                <Textarea
                  value={stockForm.remarks}
                  onChange={(event) => updateStockForm("remarks", event.target.value)}
                  placeholder="Optional reason or note"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isSaving} onClick={() => setStockDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Stock
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
