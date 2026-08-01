"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  ErpEmptyState,
  ErpField,
  ErpKeyValue,
  ErpMobileCard,
  ErpPage,
  ErpSection,
  ErpToolbar,
} from "@/components/erp/ErpShell";
import {
  formatDecimal,
  formatWholeNumber,
  PackStockDisplay,
  numberValue,
} from "@/components/erp/StockDisplay";
import { Button } from "@/components/ui/button";
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
import { formatPeso } from "@/lib/utils";

type CategoryOption = {
  _id: string;
  name: string;
};

type BodegaProductItem = {
  _id: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  stockQty: number;
  isPackProduct?: boolean;
  packSize?: number;
  stockPcs?: number;
  stockPacks?: number;
  stockLoosePcs?: number;
  stockDisplay?: string;
  pricePerPack?: number;
  pricePerPcs?: number;
  buyingPrice: number;
  sellingPrice: number;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const emptyForm = {
  name: "",
  categoryId: "NONE",
  stockQty: "0",
  buyingPrice: "0",
  sellingPrice: "0",
};

const emptyStockForm = {
  quantity: "0",
  remarks: "",
};

function getStockPcs(product: BodegaProductItem) {
  return numberValue(product.stockPcs ?? product.stockQty);
}

function getPackSize(product: BodegaProductItem) {
  return numberValue(product.packSize);
}

function getPricePerPack(product: BodegaProductItem) {
  return numberValue(product.pricePerPack ?? product.sellingPrice);
}

function getPricePerPcs(product: BodegaProductItem) {
  const pricePerPcs = numberValue(product.pricePerPcs);
  if (pricePerPcs > 0) return pricePerPcs;

  const packSize = getPackSize(product);
  if (product.isPackProduct && packSize > 0) {
    return getPricePerPack(product) / packSize;
  }

  return numberValue(product.sellingPrice);
}

export function BodegaProductsPageClient() {
  const [products, setProducts] = useState<BodegaProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [meta, setMeta] = useState<ApiMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState("100");
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [categoryId, setCategoryId] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<BodegaProductItem | null>(null);
  const [stockProduct, setStockProduct] = useState<BodegaProductItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [stockForm, setStockForm] = useState(emptyStockForm);

  async function loadCategories() {
    try {
      const res = await fetch("/api/categories?limit=100", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load categories.");
      }

      setCategories(json.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load categories.");
    }
  }

  async function loadProducts() {
    setIsLoading(true);

    const params = new URLSearchParams({ page: String(page), limit });
    if (search) params.set("search", search);
    if (categoryId !== "ALL") params.set("categoryId", categoryId);

    try {
      const res = await fetch(`/api/bodega-products?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load bodega products.");
      }

      setProducts(json.data || []);
      setMeta(
        json.meta || {
          page,
          limit: Number(limit),
          total: 0,
          totalPages: 1,
        }
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load bodega products.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  useEffect(() => {
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, categoryId]);

  function updateForm(name: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateStockForm(name: keyof typeof emptyStockForm, value: string) {
    setStockForm((current) => ({ ...current, [name]: value }));
  }

  function openCreateDialog() {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormDialogOpen(true);
  }

  function openEditDialog(product: BodegaProductItem) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      categoryId: product.categoryId || "NONE",
      stockQty: String(product.stockQty),
      buyingPrice: String(product.buyingPrice),
      sellingPrice: String(product.sellingPrice),
    });
    setFormDialogOpen(true);
  }

  function openStockDialog(product: BodegaProductItem) {
    setStockProduct(product);
    setStockForm(emptyStockForm);
    setStockDialogOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);

    const payload = {
      ...form,
      categoryId: form.categoryId === "NONE" ? "" : form.categoryId,
    };

    try {
      const url = editingProduct
        ? `/api/bodega-products/${editingProduct._id}`
        : "/api/bodega-products";
      const res = await fetch(url, {
        method: editingProduct ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save bodega product.");
      }

      toast.success(json.message || "Bodega product saved successfully.");
      setFormDialogOpen(false);
      await loadProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save bodega product.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStockIn(event: React.FormEvent) {
    event.preventDefault();
    if (!stockProduct) return;
    setIsSaving(true);

    try {
      const res = await fetch(`/api/bodega-products/${stockProduct._id}/stock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stockForm),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to add stock.");
      }

      toast.success(json.message || "Stock added successfully.");
      setStockDialogOpen(false);
      await loadProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add stock.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(product: BodegaProductItem) {
    const confirmed = window.confirm(`Delete ${product.name}?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/bodega-products/${product._id}`, { method: "DELETE" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to delete bodega product.");
      }

      toast.success(json.message || "Bodega product deleted successfully.");
      await loadProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete bodega product.");
    }
  }

  function applySearch() {
    setSearch(draftSearch.trim());
    setPage(1);
  }

  function resetFilters() {
    setDraftSearch("");
    setSearch("");
    setCategoryId("ALL");
    setPage(1);
  }

  return (
    <ErpPage>
      <ErpToolbar>
        <ErpField label="Search Product">
          <Input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Enter product keyword..."
            onKeyDown={(event) => {
              if (event.key === "Enter") applySearch();
            }}
          />
        </ErpField>
        <ErpField label="Category">
          <Select
            value={categoryId}
            onValueChange={(value) => {
              setCategoryId(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category._id} value={category._id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ErpField>
        <ErpField label="Show Entries">
          <Select
            value={limit}
            onValueChange={(value) => {
              setLimit(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
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
        <div className="flex items-end gap-2 xl:col-span-2 xl:justify-end">
          <Button onClick={applySearch} className="flex-1 md:flex-none">
            <Search className="mr-2 h-4 w-4" />
            Filter
          </Button>
          <Button variant="secondary" onClick={resetFilters} className="flex-1 md:flex-none">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button onClick={openCreateDialog} className="flex-1 md:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </div>
      </ErpToolbar>

      <ErpSection
        title="Bodega Product List"
        description="Professional stock display: pack products show full packs, loose PCS, and total PCS."
      >
        {isLoading ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
          </div>
        ) : products.length === 0 ? (
          <ErpEmptyState
            title="No bodega products found"
            description="Try changing your search or category filter."
            action={<Button onClick={openCreateDialog}>Add Product</Button>}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow>
                    <TableHead className="text-white">Product</TableHead>
                    <TableHead className="text-white">Category</TableHead>
                    <TableHead className="text-white">Owner Stock Now</TableHead>
                    <TableHead className="text-right text-white">Pack Size</TableHead>
                    <TableHead className="text-right text-white">Buying Price</TableHead>
                    <TableHead className="text-right text-white">Price / Pack</TableHead>
                    <TableHead className="text-right text-white">Price / PCS</TableHead>
                    <TableHead className="text-center text-white">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product._id}>
                      <TableCell className="font-bold text-slate-950">{product.name}</TableCell>
                      <TableCell>{product.categoryName || "-"}</TableCell>
                      <TableCell>
                        <PackStockDisplay
                          stockPcs={getStockPcs(product)}
                          packSize={product.isPackProduct ? getPackSize(product) : 0}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {product.isPackProduct ? `${formatWholeNumber(getPackSize(product))} pcs` : "-"}
                      </TableCell>
                      <TableCell className="text-right">{formatPeso(product.buyingPrice)}</TableCell>
                      <TableCell className="text-right">{formatPeso(getPricePerPack(product))}</TableCell>
                      <TableCell className="text-right">
                        {product.isPackProduct ? formatPeso(getPricePerPcs(product)) : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-2">
                          <Button size="icon" variant="secondary" onClick={() => openStockDialog(product)} title="Add stock">
                            <PackagePlus className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="outline" onClick={() => openEditDialog(product)} title="Edit product">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="destructive" onClick={() => handleDelete(product)} title="Delete product">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 md:hidden">
              {products.map((product) => (
                <ErpMobileCard key={product._id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-950">{product.name}</h3>
                      <p className="text-sm text-slate-500">{product.categoryName || "No category"}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="secondary" onClick={() => openStockDialog(product)}>
                        <PackagePlus className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" onClick={() => openEditDialog(product)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4">
                    <PackStockDisplay
                      stockPcs={getStockPcs(product)}
                      packSize={product.isPackProduct ? getPackSize(product) : 0}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <ErpKeyValue label="Buying" value={formatPeso(product.buyingPrice)} />
                    <ErpKeyValue label="Price / Pack" value={formatPeso(getPricePerPack(product))} />
                    <ErpKeyValue label="Price / PCS" value={product.isPackProduct ? formatPeso(getPricePerPcs(product)) : "-"} />
                    <ErpKeyValue label="Total PCS" value={formatDecimal(getStockPcs(product), 0)} />
                  </div>
                  <Button variant="destructive" className="mt-4 w-full" onClick={() => handleDelete(product)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </ErpMobileCard>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <div>
            Showing <span className="font-bold text-slate-900">{products.length}</span> of{" "}
            <span className="font-bold text-slate-900">{meta.total}</span> records
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
            >
              Previous
            </Button>
            <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              disabled={page >= meta.totalPages || isLoading}
              onClick={() => setPage((current) => Math.min(current + 1, meta.totalPages))}
            >
              Next
            </Button>
          </div>
        </div>
      </ErpSection>

      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Bodega Product" : "Add Bodega Product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Product Name</Label>
                <Input value={form.name} onChange={(event) => updateForm("name", event.target.value)} required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Category</Label>
                <Select value={form.categoryId} onValueChange={(value) => updateForm("categoryId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No Category</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category._id} value={category._id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Total Stock PCS</Label>
                <Input type="number" min="0" step="1" value={form.stockQty} onChange={(event) => updateForm("stockQty", event.target.value)} />
                <p className="text-xs text-slate-500">For sliced products, enter total PCS. Packs are displayed from Standard PCS & Packs.</p>
              </div>
              <div className="space-y-2">
                <Label>Buying Price</Label>
                <Input type="number" min="0" step="0.01" value={form.buyingPrice} onChange={(event) => updateForm("buyingPrice", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Selling Price</Label>
                <Input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(event) => updateForm("sellingPrice", event.target.value)} />
                <p className="text-xs text-slate-500">For sliced products with a standard, this is the price per pack.</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setFormDialogOpen(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Stock: {stockProduct?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleStockIn} className="space-y-4">
            {stockProduct ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Current Stock Now</p>
                <PackStockDisplay
                  stockPcs={getStockPcs(stockProduct)}
                  packSize={stockProduct.isPackProduct ? getPackSize(stockProduct) : 0}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Quantity to Add</Label>
              <Input type="number" min="0" step="1" value={stockForm.quantity} onChange={(event) => updateStockForm("quantity", event.target.value)} />
              <p className="text-xs text-slate-500">Enter PCS for sliced products. Example: 1 pack of C10 = 50 pcs.</p>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea value={stockForm.remarks} onChange={(event) => updateStockForm("remarks", event.target.value)} placeholder="Optional remarks" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStockDialogOpen(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Add Stock"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ErpPage>
  );
}
