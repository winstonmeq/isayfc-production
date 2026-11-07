// components/products/ProductsPageClient.tsx
"use client";

import { ProductUsageSelect } from "@/components/products/ProductUsageSelect";
import { PRODUCT_USAGE_OPTIONS, productUsageLabel } from "@/lib/product-usage";
import { EntryDialogContent } from "@/components/erp/EntryForm";
import { ProductUnitSelect } from "@/components/units/ProductUnitSelect";
import { isInventorySourceCategory } from "@/lib/product-classification";

import { useEffect, useState } from "react";
import {
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  Search,
  Trash2,
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

type ProductItem = {
  unitCode?: string;
  usage?: string;
  _id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  buyingPrice: number;
  unitPrice: number;
  stockPcs: number;
  stockBags: number;
  stockKilos: number;
  lowStockAlert: number;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const emptyForm = {
  usage: "UNASSIGNED",
  unitCode: "PCS",
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
  stockPcs: "0",
  stockBags: "0",
  stockKilos: "0",
  remarks: "",
};

export function ProductsPageClient() {
  const [products, setProducts] = useState<ProductItem[]>([]);
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
  const [categoryId, setCategoryId] = useState("ALL");
  const [usageFilter, setUsageFilter] = useState("ALL");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);

  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [stockProduct, setStockProduct] = useState<ProductItem | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [stockForm, setStockForm] = useState(emptyStockForm);

  async function loadCategories() {
    try {
      const res = await fetch("/api/categories?limit=100&source=GROCERY", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load categories.");
      }

      setCategories(json.data || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load categories."
      );
    }
  }

  async function loadProducts() {
    setIsLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      limit,
    });

    if (search) params.set("search", search);
    if (categoryId !== "ALL") params.set("categoryId", categoryId);
    if (usageFilter !== "ALL") params.set("usage", usageFilter);

    try {
      const res = await fetch(`/api/products?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load products.");
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
      toast.error(
        error instanceof Error ? error.message : "Failed to load products."
      );
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
  }, [page, limit, search, categoryId, usageFilter]);

  function updateForm(name: keyof typeof emptyForm, value: string) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function updateStockForm(name: keyof typeof emptyStockForm, value: string) {
    setStockForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function openCreateDialog() {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormDialogOpen(true);
  }

  function openEditDialog(product: ProductItem) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      categoryId: product.categoryId,
      unitCode: product.unitCode || "PCS",
      usage: product.usage || "UNASSIGNED",
      buyingPrice: String(product.buyingPrice),
      unitPrice: String(product.unitPrice),
      stockPcs: String(product.stockPcs),
      stockBags: String(product.stockBags),
      stockKilos: String(product.stockKilos),
      lowStockAlert: String(product.lowStockAlert),
    });
    setFormDialogOpen(true);
  }

  function openStockDialog(product: ProductItem) {
    setStockProduct(product);
    setStockForm(emptyStockForm);
    setStockDialogOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);

    try {
      const url = editingProduct
        ? `/api/products/${editingProduct._id}`
        : "/api/products";

      const res = await fetch(url, {
        method: editingProduct ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save product.");
      }

      toast.success(json.message || "Product saved successfully.");
      setFormDialogOpen(false);
      await loadProducts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save product."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStockIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!stockProduct) return;

    setIsSaving(true);

    try {
      const res = await fetch(`/api/products/${stockProduct._id}/stock-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

  async function handleDelete(product: ProductItem) {
    const confirmed = window.confirm(`Delete ${product.name}?`);

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/products/${product._id}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to delete product.");
      }

      toast.success(json.message || "Product deleted successfully.");
      await loadProducts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete product."
      );
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
    setUsageFilter("ALL");
    setPage(1);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm lg:flex-row lg:items-end">
        <div className="w-full lg:max-w-sm">
          <Label>Search Product</Label>
          <Input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Enter keyword..."
            onKeyDown={(event) => {
              if (event.key === "Enter") applySearch();
            }}
          />
        </div>

        <div className="w-full lg:w-64">
          <Label>Category</Label>
          <Select
            value={categoryId}
            onValueChange={(value) => {
              setCategoryId(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category._id} value={category._id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full lg:w-56">
          <Label>Usage</Label>
          <Select
            value={usageFilter}
            onValueChange={(value) => {
              setUsageFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Usages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Usages</SelectItem>
              {PRODUCT_USAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full lg:w-36">
          <Label>Show entries</Label>
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
        </div>

        <Button onClick={applySearch}>
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>

        <Button variant="outline" onClick={resetFilters}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle>All Product Info</CardTitle>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>

            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-slate-900">
                <TableRow>
                  <TableHead className="text-center text-white">Name</TableHead>
                  <TableHead className="text-center text-white">Source</TableHead>
                    <TableHead className="text-center text-white">Usage</TableHead>
                  <TableHead className="text-center text-white">Category</TableHead>
                  <TableHead className="text-center text-white">Buying Price</TableHead>
                  <TableHead className="text-center text-white">Unit Price</TableHead>
                  <TableHead className="text-center text-white">Stock Quantity</TableHead>
                  <TableHead className="text-center text-white">Stock (Bags)</TableHead>
                  <TableHead className="text-center text-white">Stock (Kilos)</TableHead>
                  <TableHead className="text-center text-white">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : products.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No products found.
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product) => (
                    <TableRow key={product._id}>
                      <TableCell className="text-center">{product.name}<span className="block text-xs text-slate-500">Unit: {product.unitCode || "PCS"}</span></TableCell>
                      <TableCell className="text-center">Grocery</TableCell>
                      <TableCell className="text-center">{productUsageLabel(product.usage)}</TableCell>
                      <TableCell className="text-center">
                        {product.categoryName || "Uncategorized"}{isInventorySourceCategory(product.categoryName) && <span className="block text-xs text-amber-700">Update product category</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {formatPeso(product.buyingPrice)}
                      </TableCell>
                      <TableCell className="text-center">
                        {formatPeso(product.unitPrice)}
                      </TableCell>
                      <TableCell className="text-center">
                        {product.stockPcs.toLocaleString()} {product.unitCode || "PCS"}
                      </TableCell>
                      <TableCell className="text-center">
                        {product.stockBags.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        {product.stockKilos.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            size="icon"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => openStockDialog(product)}
                          >
                            <PackagePlus className="h-4 w-4" />
                          </Button>

                          <Button
                            size="icon"
                            className="bg-yellow-500 text-black hover:bg-yellow-600"
                            onClick={() => openEditDialog(product)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            size="icon"
                            variant="destructive"
                            onClick={() => handleDelete(product)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {products.length} of {meta.total} records
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
              >
                Previous
              </Button>

              <span className="rounded-md border px-3 py-2">
                Page {meta.page} of {meta.totalPages}
              </span>

              <Button
                variant="outline"
                disabled={page >= meta.totalPages || isLoading}
                onClick={() =>
                  setPage((current) => Math.min(current + 1, meta.totalPages))
                }
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <EntryDialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <ProductUnitSelect value={form.unitCode} onChange={(value) => updateForm("unitCode", value)} />
              <ProductUsageSelect value={form.usage} onChange={(value) => updateForm("usage", value)} />
              <Label htmlFor="grocery-product-source">Source</Label>
              <Input id="grocery-product-source" value="Grocery" readOnly className="bg-slate-50" />
              <Label>Product Name</Label>
              <Input
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                placeholder="e.g. C1"
                required
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Product Category</Label>
              <p className="text-xs text-slate-500">Examples: Plastic, Gloves, Ingredients. Source stays Grocery regardless of category.</p>
              <Select
                value={form.categoryId}
                onValueChange={(value) => updateForm("categoryId", value)}
              >
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
                onChange={(event) =>
                  updateForm("buyingPrice", event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Unit Price</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.unitPrice}
                onChange={(event) => updateForm("unitPrice", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Stock ({form.unitCode})</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.stockPcs}
                onChange={(event) => updateForm("stockPcs", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Stock Bags</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
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
                onChange={(event) =>
                  updateForm("stockKilos", event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Low Stock Alert</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.lowStockAlert}
                onChange={(event) =>
                  updateForm("lowStockAlert", event.target.value)
                }
              />
            </div>

            <DialogFooter className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormDialogOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>

              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </EntryDialogContent>
      </Dialog>

      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <EntryDialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Stock: {stockProduct?.name}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleStockIn} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Add PCS</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={stockForm.stockPcs}
                  onChange={(event) =>
                    updateStockForm("stockPcs", event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Add Bags</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={stockForm.stockBags}
                  onChange={(event) =>
                    updateStockForm("stockBags", event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Add Kilos</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={stockForm.stockKilos}
                  onChange={(event) =>
                    updateStockForm("stockKilos", event.target.value)
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={stockForm.remarks}
                onChange={(event) =>
                  updateStockForm("remarks", event.target.value)
                }
                placeholder="Optional remarks"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStockDialogOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>

              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Add Stock"}
              </Button>
            </DialogFooter>
          </form>
        </EntryDialogContent>
      </Dialog>
    </div>
  );
}
