"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronsUpDown,
  Eye,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { cn, formatPeso } from "@/lib/utils";

type ProductOption = {
  _id: string;
  name: string;
  categoryName?: string;
  buyingPrice: number;
  unitPrice?: number;
  stockPcs?: number;
};

type PurchaseBatch = {
  _id: string;
  datePurchased: string;
  totalItems: number;
  totalAmount: number;
  remarks?: string;
};

type PurchaseBatchDetail = PurchaseBatch & {
  items: {
    _id: string;
    productId: string;
    productName: string;
    buyingPrice: number;
    quantity: number;
    subtotal: number;
  }[];
};

type PurchaseItemForm = {
  productId: string;
  buyingPrice: string;
  quantity: string;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const emptyItem: PurchaseItemForm = {
  productId: "",
  buyingPrice: "0",
  quantity: "0",
};

function getProductBuyingPrice(product?: ProductOption) {
  if (!product) return 0;
  return Number(product.buyingPrice || 0);
}

function getProductStock(product?: ProductOption) {
  if (!product) return 0;
  return Number(product.stockPcs || 0);
}

function ProductPicker({
  products,
  value,
  onSelect,
}: {
  products: ProductOption[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedProduct = products.find((product) => product._id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-white font-normal"
        >
          <span className="truncate">
            {selectedProduct
              ? `${selectedProduct.name} — Stock: ${getProductStock(selectedProduct)}`
              : "Select product"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[520px] max-w-[calc(100vw-2rem)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search product..." />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
            <CommandGroup>
              {products.map((product) => (
                <CommandItem
                  key={product._id}
                  value={`${product.name} ${product.categoryName || ""}`}
                  onSelect={() => {
                    onSelect(product._id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === product._id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">
                    {product.name} — Stock: {getProductStock(product)}
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

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toISOString().slice(0, 10);
}

export function PurchaseBatchesPageClient() {
  const [batches, setBatches] = useState<PurchaseBatch[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [meta, setMeta] = useState<ApiMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState("10");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");

  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: "",
    dateTo: "",
    minTotal: "",
    maxTotal: "",
  });

  const [datePurchased, setDatePurchased] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [remarks, setRemarks] = useState("");

  const [items, setItems] = useState<PurchaseItemForm[]>([
    { ...emptyItem },
    { ...emptyItem },
    { ...emptyItem },
  ]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<PurchaseBatchDetail | null>(null);

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => {
      const price = Number(item.buyingPrice) || 0;
      const qty = Number(item.quantity) || 0;

      return sum + price * qty;
    }, 0);
  }, [items]);

  async function loadProducts() {
    try {
      const res = await fetch("/api/products?page=1&limit=100", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load products.");
      }

      const allProducts: ProductOption[] = [...(json.data || [])];
      const totalPages = Math.max(Number(json.meta?.totalPages || 1), 1);

      if (totalPages > 1) {
        const remainingPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            fetch(`/api/products?page=${index + 2}&limit=100`, {
              cache: "no-store",
            }).then(async (response) => {
              const pageJson = await response.json();
              if (!response.ok || !pageJson.success) {
                throw new Error(pageJson.message || "Failed to load products.");
              }
              return (pageJson.data || []) as ProductOption[];
            })
          )
        );
        allProducts.push(...remainingPages.flat());
      }

      setProducts(allProducts);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load products."
      );
    }
  }

  async function loadBatches() {
    setIsLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      limit,
    });

    if (appliedFilters.dateFrom) params.set("dateFrom", appliedFilters.dateFrom);
    if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);
    if (appliedFilters.minTotal) params.set("minTotal", appliedFilters.minTotal);
    if (appliedFilters.maxTotal) params.set("maxTotal", appliedFilters.maxTotal);

    try {
      const res = await fetch(`/api/purchase-batches?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load purchase batches.");
      }

      setBatches(json.data || []);

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
          : "Failed to load purchase batches."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function getBatchDetails(id: string) {
    setIsDetailsLoading(true);

    try {
      const res = await fetch(`/api/purchase-batches/${id}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load purchase batch.");
      }

      return json.data as PurchaseBatchDetail;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load purchase batch."
      );
      return null;
    } finally {
      setIsDetailsLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  useEffect(() => {
    void loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, appliedFilters]);

  function resetForm() {
    setEditingId(null);
    setDatePurchased(new Date().toISOString().slice(0, 10));
    setRemarks("");
    setItems([{ ...emptyItem }, { ...emptyItem }, { ...emptyItem }]);
  }

  function openAddDialog() {
    resetForm();
    setFormDialogOpen(true);
  }

  async function openViewDialog(batch: PurchaseBatch) {
    const data = await getBatchDetails(batch._id);

    if (!data) return;

    setViewItem(data);
    setViewDialogOpen(true);
  }

  async function openEditDialog(batch: PurchaseBatch) {
    const data = await getBatchDetails(batch._id);

    if (!data) return;

    setEditingId(data._id);
    setDatePurchased(formatDate(data.datePurchased));
    setRemarks(data.remarks || "");

    setItems(
      data.items.length > 0
        ? data.items.map((item) => ({
            productId: item.productId,
            buyingPrice: String(item.buyingPrice || 0),
            quantity: String(item.quantity || 0),
          }))
        : [{ ...emptyItem }]
    );

    setFormDialogOpen(true);
  }

  function updateItem(
    index: number,
    field: keyof PurchaseItemForm,
    value: string
  ) {
    setItems((current) => {
      const next = [...current];

      next[index] = {
        ...next[index],
        [field]: value,
      };

      if (field === "productId") {
        const product = products.find((item) => item._id === value);

        if (product) {
          next[index].buyingPrice = String(getProductBuyingPrice(product));
        }
      }

      return next;
    });
  }

  function addItemRow() {
    setItems((current) => [...current, { ...emptyItem }]);
  }

  function removeItemRow(index: number) {
    setItems((current) => {
      if (current.length === 1) return current;
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  function applyFilters() {
    setAppliedFilters({
      dateFrom,
      dateTo,
      minTotal,
      maxTotal,
    });

    setPage(1);
  }

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setMinTotal("");
    setMaxTotal("");

    setAppliedFilters({
      dateFrom: "",
      dateTo: "",
      minTotal: "",
      maxTotal: "",
    });

    setPage(1);
  }

  async function savePurchaseBatch() {
    if (!datePurchased) {
      toast.error("Purchase date is required.");
      return;
    }

    const validItems = items
      .filter((item) => item.productId && Number(item.quantity) > 0)
      .map((item) => ({
        productId: item.productId,
        buyingPrice: Number(item.buyingPrice) || 0,
        quantity: Number(item.quantity) || 0,
      }));

    if (validItems.length === 0) {
      toast.error("Add at least one product with quantity.");
      return;
    }

    for (const item of validItems) {
      const product = products.find((product) => product._id === item.productId);

      if (!product) {
        toast.error("Selected product was not found.");
        return;
      }

      if (item.buyingPrice <= 0) {
        toast.error(`Buying price must be greater than zero for ${product.name}.`);
        return;
      }

      if (item.quantity <= 0) {
        toast.error(`Quantity must be greater than zero for ${product.name}.`);
        return;
      }
    }

    setIsSaving(true);

    try {
      const url = editingId
        ? `/api/purchase-batches/${editingId}`
        : "/api/purchase-batches";

      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          datePurchased,
          remarks,
          items: validItems,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save purchase batch.");
      }

      toast.success(json.message || "Purchase batch saved successfully.");

      setFormDialogOpen(false);
      resetForm();

      await loadBatches();
      await loadProducts();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save purchase batch."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function voidPurchaseBatch(batch: PurchaseBatch) {
    const confirmed = window.confirm(
      `Void purchase batch dated ${formatDate(
        batch.datePurchased
      )}? This will reverse the added product stock.`
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/purchase-batches/${batch._id}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to void purchase batch.");
      }

      toast.success(json.message || "Purchase batch voided successfully.");

      await loadBatches();
      await loadProducts();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to void purchase batch."
      );
    }
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
            <div className="space-y-2">
              <Label>Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Min Total</Label>
              <Input
                type="number"
                min="0"
                value={minTotal}
                onChange={(event) => setMinTotal(event.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label>Max Total</Label>
              <Input
                type="number"
                min="0"
                value={maxTotal}
                onChange={(event) => setMaxTotal(event.target.value)}
                placeholder="0"
              />
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={applyFilters} className="rounded-xl">
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
              <Button
                variant="secondary"
                onClick={resetFilters}
                className="rounded-xl"
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
              <Button onClick={openAddDialog} className="rounded-xl">
                <PackagePlus className="mr-2 h-4 w-4" />
                Add Purchase Batch
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-5">
          <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <p className="text-lg font-bold text-slate-950">
                Purchase Batch Records
              </p>
              <p className="text-sm text-slate-500">
                Showing {batches.length} of {meta.total} records
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-sm">Show</Label>
              <Select
                value={limit}
                onValueChange={(value) => {
                  setLimit(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-24">
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
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow>
                  <TableHead className="text-white">Date Purchased</TableHead>
                  <TableHead className="text-right text-white">
                    Total Items
                  </TableHead>
                  <TableHead className="text-right text-white">
                    Total Amount
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-36 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                    </TableCell>
                  </TableRow>
                ) : batches.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-36 text-center text-slate-500"
                    >
                      No purchase batches found.
                    </TableCell>
                  </TableRow>
                ) : (
                  batches.map((batch) => (
                    <TableRow key={batch._id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-slate-400" />
                          {formatDate(batch.datePurchased)}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        {Number(batch.totalItems || 0).toLocaleString()}
                      </TableCell>

                      <TableCell className="text-right font-semibold">
                        {formatPeso(Number(batch.totalAmount || 0))}
                      </TableCell>

                      <TableCell>
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openViewDialog(batch)}
                            disabled={isDetailsLoading}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(batch)}
                            disabled={isDetailsLoading}
                          >
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>

                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => voidPurchaseBatch(batch)}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Void
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
            >
              Previous
            </Button>

            <span className="rounded-xl border px-3 py-2 text-sm text-slate-600">
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
        </CardContent>
      </Card>

      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">
              {editingId ? "Edit Purchase Batch" : "Add Purchase Batch"}
            </DialogTitle>
            <DialogDescription>
              Select products, quantity, and buying price. Saving will update
              product stock.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Date Purchased</Label>
                <Input
                  type="date"
                  value={datePurchased}
                  onChange={(event) => setDatePurchased(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Remarks</Label>
                <Input
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Optional remarks"
                />
              </div>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const selectedProduct = products.find(
                  (product) => product._id === item.productId
                );

                const subtotal =
                  (Number(item.buyingPrice) || 0) *
                  (Number(item.quantity) || 0);

                return (
                  <div
                    key={index}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                      <div className="space-y-1">
                        <Label>Product</Label>
                        <ProductPicker
                          products={products}
                          value={item.productId}
                          onSelect={(value) =>
                            updateItem(index, "productId", value)
                          }
                        />

                        {selectedProduct ? (
                          <p className="text-xs text-slate-500">
                            Current stock: {getProductStock(selectedProduct)}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-1">
                        <Label>Buying Price</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.buyingPrice}
                          onChange={(event) =>
                            updateItem(index, "buyingPrice", event.target.value)
                          }
                          className="bg-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={(event) =>
                            updateItem(index, "quantity", event.target.value)
                          }
                          className="bg-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label>Subtotal</Label>
                        <Input
                          value={subtotal.toFixed(2)}
                          disabled
                          className="bg-white"
                        />
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => removeItemRow(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="secondary"
              className="w-full rounded-xl"
              onClick={addItemRow}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add More Product
            </Button>

            <div className="rounded-2xl bg-slate-950 p-5 text-white">
              <p className="text-sm text-white/70">Total Purchase Amount</p>
              <p className="text-3xl font-black">{formatPeso(totalAmount)}</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving}
              onClick={() => setFormDialogOpen(false)}
            >
              Cancel
            </Button>

            <Button
              type="button"
              disabled={isSaving}
              onClick={savePurchaseBatch}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PackagePlus className="mr-2 h-4 w-4" />
              )}
              {editingId ? "Update Purchase Batch" : "Save Purchase Batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">
              Purchase Batch Details
            </DialogTitle>
            <DialogDescription>
              View purchase item lines included in this batch.
            </DialogDescription>
          </DialogHeader>

          {!viewItem ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border bg-slate-50 p-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-slate-500">Date Purchased</p>
                  <p className="font-bold">{formatDate(viewItem.datePurchased)}</p>
                </div>

                <div>
                  <p className="text-sm text-slate-500">Total Items</p>
                  <p className="font-bold">
                    {Number(viewItem.totalItems || 0).toLocaleString()}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-slate-500">Total Amount</p>
                  <p className="font-bold">
                    {formatPeso(Number(viewItem.totalAmount || 0))}
                  </p>
                </div>
              </div>

              {viewItem.remarks ? (
                <div className="rounded-2xl border p-4">
                  <p className="text-sm text-slate-500">Remarks</p>
                  <p className="font-medium">{viewItem.remarks}</p>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader className="bg-slate-950">
                    <TableRow>
                      <TableHead className="text-white">Product</TableHead>
                      <TableHead className="text-right text-white">
                        Buying Price
                      </TableHead>
                      <TableHead className="text-right text-white">
                        Quantity
                      </TableHead>
                      <TableHead className="text-right text-white">
                        Subtotal
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {viewItem.items.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="h-24 text-center text-slate-500"
                        >
                          No purchase items found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      viewItem.items.map((item) => (
                        <TableRow key={item._id}>
                          <TableCell className="font-medium">
                            {item.productName}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPeso(Number(item.buyingPrice || 0))}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(item.quantity || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatPeso(Number(item.subtotal || 0))}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setViewDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
