"use client";

import { EntryDialogContent } from "@/components/erp/EntryForm";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  ErpEmptyState,
  ErpField,
  ErpKeyValue,
  ErpMobileCard,
  ErpPage,
  ErpPageHeader,
  ErpSection,
  ErpToolbar,
} from "@/components/erp/ErpShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import { formatPeso } from "@/lib/utils";

type ProductSource = "BODEGA" | "GROCERY";
type UnitLabel = "PCS" | "PACK" | "QTY" | "KG" | "BAG";

type OutletOption = {
  _id: string;
  name: string;
  code: string;
  status: string;
};

type ProductOption = {
  _id: string;
  name: string;
  categoryName?: string;
  stockQty?: number;
  stockPcs?: number;
  stockDisplay?: string;
  packSize?: number;
  buyingPrice?: number;
  sellingPrice?: number;
  unitPrice?: number;
};

type OutletInventoryItem = {
  _id: string;
  outletId: string;
  outletName: string;
  outletCode: string;
  productSource: ProductSource;
  productId: string;
  productName: string;
  categoryName: string;
  stockQty: number;
  unitLabel: UnitLabel;
  packSize: number;
  stockPacks: number;
  stockLoosePcs: number;
  stockDisplay: string;
  lowStockAlert: number;
  isLowStock: boolean;
  buyingPrice: number;
  sellingPrice: number;
  remarks: string;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const emptyForm = {
  outletId: "",
  productSource: "BODEGA" as ProductSource,
  productId: "",
  stockQty: "0",
  unitLabel: "QTY" as UnitLabel,
  lowStockAlert: "0",
  remarks: "",
};

const emptyEditForm = {
  stockQty: "0",
  unitLabel: "QTY" as UnitLabel,
  lowStockAlert: "0",
  remarks: "",
};

function sourceLabel(source: ProductSource) {
  return source === "BODEGA" ? "Bodega" : "Grocery/Product";
}

export function OutletInventoryPageClient() {
  const [items, setItems] = useState<OutletInventoryItem[]>([]);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [bodegaProducts, setBodegaProducts] = useState<ProductOption[]>([]);
  const [groceryProducts, setGroceryProducts] = useState<ProductOption[]>([]);
  const [meta, setMeta] = useState<ApiMeta>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState("25");
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [outletId, setOutletId] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const [lowStockOnly, setLowStockOnly] = useState("0");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OutletInventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyEditForm);

  const productOptions = form.productSource === "BODEGA" ? bodegaProducts : groceryProducts;

  async function loadOutlets() {
    try {
      const res = await fetch("/api/outlets?limit=100", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.success) {
        setOutlets(json.data || []);
      }
    } catch {
      toast.error("Failed to load outlets.");
    }
  }

  async function loadProducts() {
    try {
      const [bodegaRes, groceryRes] = await Promise.all([
        fetch("/api/bodega-products?limit=100", { cache: "no-store" }),
        fetch("/api/products?limit=100", { cache: "no-store" }),
      ]);

      const [bodegaJson, groceryJson] = await Promise.all([
        bodegaRes.json(),
        groceryRes.json(),
      ]);

      if (bodegaRes.ok && bodegaJson.success) {
        setBodegaProducts(bodegaJson.data || []);
      }

      if (groceryRes.ok && groceryJson.success) {
        setGroceryProducts(groceryJson.data || []);
      }
    } catch {
      toast.error("Failed to load product options.");
    }
  }

  async function loadInventory() {
    setIsLoading(true);

    const params = new URLSearchParams({ page: String(page), limit });
    if (search) params.set("search", search);
    if (outletId !== "ALL") params.set("outletId", outletId);
    if (source !== "ALL") params.set("source", source);
    if (lowStockOnly === "1") params.set("lowStockOnly", "1");

    try {
      const res = await fetch(`/api/outlet-inventory?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load outlet inventory.");
      }

      setItems(json.data || []);
      setMeta(json.meta || { page, limit: Number(limit), total: 0, totalPages: 1 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load outlet inventory.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOutlets();
    void loadProducts();
  }, []);

  useEffect(() => {
    void loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, outletId, source, lowStockOnly]);

  function updateForm(name: keyof typeof emptyForm, value: string) {
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "productSource" ? { productId: "", unitLabel: value === "BODEGA" ? "PCS" : "QTY" } : {}),
    } as typeof emptyForm));
  }

  function updateEditForm(name: keyof typeof emptyEditForm, value: string) {
    setEditForm((current) => ({ ...current, [name]: value } as typeof emptyEditForm));
  }

  function openCreateDialog() {
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(item: OutletInventoryItem) {
    setEditingItem(item);
    setEditForm({
      stockQty: String(item.stockQty || 0),
      unitLabel: item.unitLabel || "QTY",
      lowStockAlert: String(item.lowStockAlert || 0),
      remarks: item.remarks || "",
    });
    setEditDialogOpen(true);
  }

  async function saveInventory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const res = await fetch("/api/outlet-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to add outlet inventory item.");
      }

      toast.success(json.message || "Outlet inventory item added.");
      setDialogOpen(false);
      await loadInventory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add outlet inventory item.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateInventory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;
    setIsSaving(true);

    try {
      const res = await fetch(`/api/outlet-inventory/${editingItem._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to update outlet inventory item.");
      }

      toast.success(json.message || "Outlet inventory updated.");
      setEditDialogOpen(false);
      await loadInventory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update outlet inventory item.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteInventory(item: OutletInventoryItem) {
    const confirmed = window.confirm(`Delete ${item.productName} from ${item.outletName}?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/outlet-inventory/${item._id}`, { method: "DELETE" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to delete outlet inventory item.");
      }

      toast.success(json.message || "Outlet inventory item deleted.");
      await loadInventory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete outlet inventory item.");
    }
  }

  return (
    <ErpPage>
      <ErpPageHeader
        eyebrow="Outlet inventory"
        title="Outlet Inventory"
        description="Track each outlet's own stock for bodega and grocery/product items before connecting Flutter POS and delivery confirmations."
        actions={
          <Button onClick={openCreateDialog} className="rounded-2xl">
            <Plus className="mr-2 h-4 w-4" />
            Add Stock Item
          </Button>
        }
      />

      <ErpToolbar>
        <ErpField label="Search">
          <div className="flex gap-2">
            <Input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Product or category..."
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setPage(1);
                  setSearch(draftSearch.trim());
                }
              }}
            />
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setPage(1);
                setSearch(draftSearch.trim());
              }}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </ErpField>

        <ErpField label="Outlet">
          <Select
            value={outletId}
            onValueChange={(value) => {
              setPage(1);
              setOutletId(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Outlets</SelectItem>
              {outlets.map((outlet) => (
                <SelectItem key={outlet._id} value={outlet._id}>
                  {outlet.name} ({outlet.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ErpField>

        <ErpField label="Source">
          <Select
            value={source}
            onValueChange={(value) => {
              setPage(1);
              setSource(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Sources</SelectItem>
              <SelectItem value="BODEGA">Bodega</SelectItem>
              <SelectItem value="GROCERY">Grocery/Product</SelectItem>
            </SelectContent>
          </Select>
        </ErpField>

        <ErpField label="Low Stock">
          <Select
            value={lowStockOnly}
            onValueChange={(value) => {
              setPage(1);
              setLowStockOnly(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">All Stock</SelectItem>
              <SelectItem value="1">Low Stock Only</SelectItem>
            </SelectContent>
          </Select>
        </ErpField>

        <ErpField label="Rows">
          <Select
            value={limit}
            onValueChange={(value) => {
              setPage(1);
              setLimit(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </ErpField>

        <ErpField label="Reset">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraftSearch("");
              setSearch("");
              setOutletId("ALL");
              setSource("ALL");
              setLowStockOnly("0");
              setPage(1);
            }}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </ErpField>
      </ErpToolbar>

      <ErpSection
        title="Outlet Stock"
        description="For sliced bodega items, stock remains in PCS but displays as packs / loose pcs when pack size exists."
      >
        {isLoading ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : items.length === 0 ? (
          <ErpEmptyState
            title="No outlet inventory found"
            description="Add stock items after creating outlets. Delivery confirmation will later update this inventory automatically."
            action={<Button onClick={openCreateDialog}>Add Stock Item</Button>}
          />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 lg:block">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow>
                    <TableHead className="text-white">Outlet</TableHead>
                    <TableHead className="text-white">Product</TableHead>
                    <TableHead className="text-white">Source</TableHead>
                    <TableHead className="text-right text-white">Current Stock</TableHead>
                    <TableHead className="text-right text-white">Pack Size</TableHead>
                    <TableHead className="text-right text-white">Low Alert</TableHead>
                    <TableHead className="text-right text-white">Selling Price</TableHead>
                    <TableHead className="text-right text-white">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item._id}>
                      <TableCell>
                        <div className="font-black text-slate-950">{item.outletName || "-"}</div>
                        <div className="text-xs font-semibold text-slate-500">{item.outletCode || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-black text-slate-950">{item.productName}</div>
                        <div className="text-xs text-slate-500">{item.categoryName || "No category"}</div>
                      </TableCell>
                      <TableCell>{sourceLabel(item.productSource)}</TableCell>
                      <TableCell className="text-right">
                        <div className={item.isLowStock ? "font-black text-rose-600" : "font-black text-slate-950"}>
                          {item.stockDisplay || `${item.stockQty.toLocaleString()} ${item.unitLabel.toLowerCase()}`}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.packSize > 0 ? `${item.packSize.toLocaleString()} pcs/pack` : "-"}
                      </TableCell>
                      <TableCell className="text-right">{item.lowStockAlert.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatPeso(item.sellingPrice)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditDialog(item)}>
                            <Pencil className="mr-1 h-4 w-4" />
                            Adjust
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteInventory(item)}>
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 lg:hidden">
              {items.map((item) => (
                <ErpMobileCard key={item._id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-slate-950">{item.productName}</div>
                      <div className="text-xs text-slate-500">{item.outletName} • {sourceLabel(item.productSource)}</div>
                    </div>
                    {item.isLowStock ? (
                      <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-black text-rose-700">
                        LOW
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <ErpKeyValue label="Current Stock" value={item.stockDisplay || item.stockQty.toLocaleString()} />
                    <ErpKeyValue label="Pack Size" value={item.packSize > 0 ? `${item.packSize} pcs` : "-"} />
                    <ErpKeyValue label="Low Alert" value={item.lowStockAlert.toLocaleString()} />
                    <ErpKeyValue label="Selling Price" value={formatPeso(item.sellingPrice)} />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(item)}>
                      Adjust
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteInventory(item)}>
                      Delete
                    </Button>
                  </div>
                </ErpMobileCard>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
              <div>
                Showing page {meta.page} of {meta.totalPages} • {meta.total.toLocaleString()} rows
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </ErpSection>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <EntryDialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Outlet Inventory Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveInventory} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Outlet</Label>
                <Select value={form.outletId} onValueChange={(value) => updateForm("outletId", value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select outlet" />
                  </SelectTrigger>
                  <SelectContent>
                    {outlets.map((outlet) => (
                      <SelectItem key={outlet._id} value={outlet._id}>
                        {outlet.name} ({outlet.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Product Source</Label>
                <Select value={form.productSource} onValueChange={(value) => updateForm("productSource", value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BODEGA">Bodega</SelectItem>
                    <SelectItem value="GROCERY">Grocery/Product</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Product</Label>
                <Select value={form.productId} onValueChange={(value) => updateForm("productId", value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {productOptions.map((product) => (
                      <SelectItem key={product._id} value={product._id}>
                        {product.name}
                        {product.categoryName ? ` - ${product.categoryName}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Opening Stock</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.stockQty}
                  onChange={(event) => updateForm("stockQty", event.target.value)}
                />
                <p className="text-xs text-slate-500">
                  For sliced bodega products, enter PCS. The system displays packs / loose pcs.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Unit Label</Label>
                <Select value={form.unitLabel} onValueChange={(value) => updateForm("unitLabel", value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PCS">PCS</SelectItem>
                    <SelectItem value="PACK">PACK</SelectItem>
                    <SelectItem value="QTY">QTY</SelectItem>
                    <SelectItem value="KG">KG</SelectItem>
                    <SelectItem value="BAG">BAG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Low Stock Alert</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.lowStockAlert}
                  onChange={(event) => updateForm("lowStockAlert", event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={form.remarks}
                onChange={(event) => updateForm("remarks", event.target.value)}
                placeholder="Optional notes"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" disabled={isSaving} onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Item
              </Button>
            </DialogFooter>
          </form>
        </EntryDialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <EntryDialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Adjust Outlet Inventory</DialogTitle>
          </DialogHeader>
          <form onSubmit={updateInventory} className="space-y-4">
            {editingItem ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                <div className="font-black text-slate-950">{editingItem.productName}</div>
                <div className="text-slate-500">{editingItem.outletName} • Current: {editingItem.stockDisplay}</div>
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Current Stock Now</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.stockQty}
                  onChange={(event) => updateEditForm("stockQty", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Label</Label>
                <Select value={editForm.unitLabel} onValueChange={(value) => updateEditForm("unitLabel", value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PCS">PCS</SelectItem>
                    <SelectItem value="PACK">PACK</SelectItem>
                    <SelectItem value="QTY">QTY</SelectItem>
                    <SelectItem value="KG">KG</SelectItem>
                    <SelectItem value="BAG">BAG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Low Stock Alert</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.lowStockAlert}
                  onChange={(event) => updateEditForm("lowStockAlert", event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={editForm.remarks}
                onChange={(event) => updateEditForm("remarks", event.target.value)}
                placeholder="Reason for adjustment"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" disabled={isSaving} onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Adjustment
              </Button>
            </DialogFooter>
          </form>
        </EntryDialogContent>
      </Dialog>
    </ErpPage>
  );
}
