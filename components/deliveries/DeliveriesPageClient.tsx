// components/deliveries/DeliveriesPageClient.tsx
"use client";

import { EntryDialogContent } from "@/components/erp/EntryForm";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatPeso } from "@/lib/utils";

type SupplierOption = {
  _id: string;
  name: string;
};

type CategoryOption = {
  _id: string;
  name: string;
};

type ProductOption = {
  _id: string;
  name: string;
  buyingPrice: number;
  categoryId: string;
  categoryName: string;
  stockQty?: number;
};

type DeliveryItemForm = {
  categoryId: string;
  bodegaProductId: string;
  bags: string;
  kilos: string;
  pieces: string;
  buyingPrice: string;
};

type DeliveryItem = {
  _id: string;
  supplierName: string;
  productNames?: string[];
  deliveryCode: string;
  receiptNumber: string;
  totalBags: number;
  totalKilos: number;
  totalPieces: number;
  totalAmount: number;
  deliveryDate: string;
  remarks: string;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const emptyForm = {
  supplierId: "",
  deliveryCode: "",
  receiptNumber: "",
  deliveryDate: new Date().toISOString().slice(0, 10),
  remarks: "",
};

const emptyItem: DeliveryItemForm = {
  categoryId: "",
  bodegaProductId: "",
  bags: "0",
  kilos: "0",
  pieces: "0",
  buyingPrice: "0",
};

function getObjectId(value: any) {
  return value?._id?.toString?.() || value?.toString?.() || "";
}

function getCategoryId(item: any) {
  if (typeof item.categoryId === "string") return item.categoryId;

  return (
    item.categoryId?._id?.toString?.() ||
    item.category?._id?.toString?.() ||
    ""
  );
}

function getCategoryName(item: any) {
  return (
    item.categoryName ||
    item.categoryId?.name ||
    item.category?.name ||
    "Uncategorized"
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toISOString().slice(0, 10);
}

async function fetchAllLookupRows(path: string) {
  const rows: any[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const separator = path.includes("?") ? "&" : "?";
    const res = await fetch(
      `${path}${separator}page=${page}&limit=100`,
      { cache: "no-store" }
    );
    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to load lookup data.");
    }

    rows.push(...(json.data || []));
    totalPages = Math.max(Number(json.meta?.totalPages || 1), 1);
    page += 1;
  } while (page <= totalPages);

  return rows;
}

export function DeliveriesPageClient() {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const deliveryTotals = useMemo(() => deliveries.reduce((sum, delivery) => ({
    bags: sum.bags + (Number(delivery.totalBags) || 0),
    kilos: sum.kilos + (Number(delivery.totalKilos) || 0),
    pieces: sum.pieces + (Number(delivery.totalPieces) || 0),
    amount: sum.amount + (Number(delivery.totalAmount) || 0),
  }), { bags: 0, kilos: 0, pieces: 0, amount: 0 }), [deliveries]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
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
  const [deliveryCode, setDeliveryCode] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");

  const [appliedFilters, setAppliedFilters] = useState({
    product: "",
    dateFrom: "",
    dateTo: "",
    deliveryCode: "",
    receiptNumber: "",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<DeliveryItemForm[]>([{ ...emptyItem }]);
  const [viewData, setViewData] = useState<any>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const totals = useMemo(() => {
    return items.reduce(
      (sum, item) => {
        const bags = Number(item.bags) || 0;
        const kilos = Number(item.kilos) || 0;
        const pieces = Number(item.pieces) || 0;
        const buyingPrice = Number(item.buyingPrice) || 0;
        const lineTotal = kilos > 0 ? kilos * buyingPrice : pieces * buyingPrice;

        return {
          bags: sum.bags + bags,
          kilos: sum.kilos + kilos,
          pieces: sum.pieces + pieces,
          amount: sum.amount + lineTotal,
        };
      },
      {
        bags: 0,
        kilos: 0,
        pieces: 0,
        amount: 0,
      }
    );
  }, [items]);

  async function loadSuppliers() {
    const res = await fetch("/api/suppliers?limit=100", {
      cache: "no-store",
    });

    const json = await res.json();

    if (res.ok && json.success) {
      setSuppliers(json.data || []);
    }
  }

  async function loadCategories() {
    const rows = await fetchAllLookupRows("/api/categories");
    setCategories(rows);
  }

  async function loadProducts() {
    const rows = await fetchAllLookupRows("/api/bodega-products");
    const normalizedProducts: ProductOption[] = rows.map((item: any) => ({
      _id: item._id,
      name: item.name,
      buyingPrice: Number(item.buyingPrice || 0),
      categoryId: getCategoryId(item),
      categoryName: getCategoryName(item),
      stockQty: Number(item.stockQty || 0),
    }));

    setProducts(normalizedProducts);
  }

  async function loadDeliveries() {
    setIsLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      limit,
    });

    if (appliedFilters.dateFrom) {
      params.set("dateFrom", appliedFilters.dateFrom);
    }

    if (appliedFilters.dateTo) {
      params.set("dateTo", appliedFilters.dateTo);
    }

    if (appliedFilters.deliveryCode) {
      params.set("deliveryCode", appliedFilters.deliveryCode);
    }

    if (appliedFilters.receiptNumber) {
      params.set("receiptNumber", appliedFilters.receiptNumber);
    }
    if (appliedFilters.product) params.set("product", appliedFilters.product);

    try {
      const res = await fetch(`/api/deliveries?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load deliveries.");
      }

      setDeliveries(json.data || []);
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
        error instanceof Error ? error.message : "Failed to load deliveries."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSuppliers();
    void loadCategories();
    void loadProducts();
  }, []);

  useEffect(() => {
    void loadDeliveries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, appliedFilters]);

  function updateForm(name: keyof typeof emptyForm, value: string) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function getProductsByCategory(categoryId: string) {
    if (!categoryId) return products;

    const selectedCategory = categories.find(
      (category) => category._id === categoryId
    );

    return products.filter(
      (product) =>
        product.categoryId === categoryId ||
        product.categoryName === selectedCategory?.name
    );
  }

  function updateItem(
    index: number,
    field: keyof DeliveryItemForm,
    value: string
  ) {
    setItems((current) => {
      const next = [...current];

      next[index] = {
        ...next[index],
        [field]: value,
      };

      if (field === "categoryId") {
        next[index].bodegaProductId = "";
        next[index].buyingPrice = "0";
      }

      if (field === "bodegaProductId") {
        const product = products.find((item) => item._id === value);

        if (product) {
          next[index].buyingPrice = String(product.buyingPrice || 0);

          if (!next[index].categoryId && product.categoryId) {
            next[index].categoryId = product.categoryId;
          }
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

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setItems([{ ...emptyItem }]);
  }

  function openCreateDialog() {
    resetForm();
    setFormDialogOpen(true);
  }

  function applyFilters() {
    setAppliedFilters({
      product: productFilter.trim(),
      dateFrom,
      dateTo,
      deliveryCode: deliveryCode.trim(),
      receiptNumber: receiptNumber.trim(),
    });
    setPage(1);
  }

  function resetFilters() {
    setProductFilter("");
    setDateFrom("");
    setDateTo("");
    setDeliveryCode("");
    setReceiptNumber("");
    setAppliedFilters({
      product: "",
      dateFrom: "",
      dateTo: "",
      deliveryCode: "",
      receiptNumber: "",
    });
    setPage(1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.supplierId) {
      toast.error("Supplier is required.");
      return;
    }

    if (!form.deliveryCode.trim()) {
      toast.error("Delivery code is required.");
      return;
    }

    if (!form.receiptNumber.trim()) {
      toast.error("Receipt number is required.");
      return;
    }

    const validItems = items.filter(
      (item) =>
        item.bodegaProductId &&
        ((Number(item.bags) || 0) > 0 ||
          (Number(item.kilos) || 0) > 0 ||
          (Number(item.pieces) || 0) > 0)
    );

    if (validItems.length === 0) {
      toast.error("Add at least one product with bags, kilos, or pieces.");
      return;
    }

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const isLateEntry = !editingId && form.deliveryDate < today;
    const correctionReason = editingId
      ? window.prompt("Reason for correcting this posted delivery (required):")?.trim()
      : isLateEntry
        ? window.prompt("Reason for entering this delivery late (required):")?.trim()
        : "";
    if ((editingId || isLateEntry) && (!correctionReason || correctionReason.length < 5)) {
      toast.error("Enter a correction reason of at least 5 characters.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        ...form,
        correctionReason,
        items: validItems.map((item) => ({
          categoryId: item.categoryId,

          bodegaProductId: item.bodegaProductId,

          // fallback if your backend still accepts productId
          productId: item.bodegaProductId,

          bags: Number(item.bags) || 0,
          kilos: Number(item.kilos) || 0,
          pieces: Number(item.pieces) || 0,
          buyingPrice: Number(item.buyingPrice) || 0,
        })),
      };

      const url = editingId
        ? `/api/deliveries/${editingId}`
        : "/api/deliveries";

      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save delivery.");
      }

      toast.success(
        json.message ||
          (editingId
            ? "Delivery updated successfully."
            : "Delivery saved successfully.")
      );

      setFormDialogOpen(false);
      resetForm();

      await loadDeliveries();
      await loadProducts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save delivery."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleView(delivery: DeliveryItem) {
    try {
      const res = await fetch(`/api/deliveries/${delivery._id}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load delivery details.");
      }

      setViewData(json.data);
      setViewDialogOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load delivery details."
      );
    }
  }

  async function handleEdit(delivery: DeliveryItem) {
    setIsDetailsLoading(true);

    try {
      const res = await fetch(`/api/deliveries/${delivery._id}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load delivery details.");
      }

      const data = json.data;
      const detailItems = data.items || data.lines || [];

      setEditingId(delivery._id);

      setForm({
        supplierId: getObjectId(data.supplierId),
        deliveryCode: data.deliveryCode || "",
        receiptNumber: data.receiptNumber || "",
        deliveryDate: data.deliveryDate
          ? new Date(data.deliveryDate).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        remarks: data.remarks || "",
      });

      setItems(
        detailItems.length > 0
          ? detailItems.map((line: any) => {
              const productId =
                getObjectId(line.bodegaProductId) || getObjectId(line.productId);

              const product = products.find((item) => item._id === productId);

              return {
                categoryId:
                  getObjectId(line.categoryId) ||
                  product?.categoryId ||
                  "",
                bodegaProductId: productId,
                bags: String(line.bags || 0),
                kilos: String(line.kilos || 0),
                pieces: String(line.pieces || 0),
                buyingPrice: String(line.buyingPrice || 0),
              };
            })
          : [{ ...emptyItem }]
      );

      setFormDialogOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load delivery details."
      );
    } finally {
      setIsDetailsLoading(false);
    }
  }

  async function handleDelete(delivery: DeliveryItem) {
    const confirmed = window.confirm(
      `Void delivery ${delivery.deliveryCode}? This will reverse the stock added.`
    );

    if (!confirmed) return;
    const reason = window.prompt("Reason for voiding this delivery:")?.trim();
    if (!reason || reason.length < 5) {
      toast.error("Enter a correction reason of at least 5 characters.");
      return;
    }

    try {
      const res = await fetch(`/api/deliveries/${delivery._id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to void delivery.");
      }

      toast.success(json.message || "Delivery voided successfully.");

      await loadDeliveries();
      await loadProducts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to void delivery."
      );
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[repeat(5,minmax(0,1fr))_7rem_auto]">
        <div>
          <Label htmlFor="delivery-product-filter">Product</Label>
          <Input id="delivery-product-filter" value={productFilter} onChange={(event) => setProductFilter(event.target.value)} placeholder="Search product name, e.g. OS1" maxLength={120} onKeyDown={(event) => { if (event.key === "Enter") applyFilters(); }} />
        </div>
        <div>
          <Label>Date From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </div>

        <div>
          <Label>Date To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </div>

        <div>
          <Label>Code Number</Label>
          <Input
            value={deliveryCode}
            onChange={(event) => setDeliveryCode(event.target.value)}
            placeholder="Delivery code"
          />
        </div>

        <div>
          <Label>Receipt Number</Label>
          <Input
            value={receiptNumber}
            onChange={(event) => setReceiptNumber(event.target.value)}
            placeholder="Receipt number"
          />
        </div>

        <div>
          <Label>Show</Label>
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

        <div className="flex items-end gap-2">
          <Button onClick={applyFilters}>
            <Search className="mr-2 h-4 w-4" />
            Filter
          </Button>

          <Button variant="outline" onClick={resetFilters}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>

          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Delivery
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-slate-900">
                <TableRow>
                  <TableHead className="text-center text-white">
                    Supplier
                  </TableHead>
                  <TableHead className="text-center text-white">Products</TableHead>
                  <TableHead className="text-center text-white">
                    Delivery Code
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Receipt #
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Total Bags
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Total Kilos
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Total Pieces
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Total Amount
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Delivery Date
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Remarks
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : deliveries.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No deliveries found.
                    </TableCell>
                  </TableRow>
                ) : (
                  deliveries.map((delivery) => (
                    <TableRow key={delivery._id}>
                      <TableCell className="text-center">
                        {delivery.supplierName}
                      </TableCell>
                      <TableCell className="min-w-[160px] whitespace-normal text-center">
                        {delivery.productNames?.length ? delivery.productNames.join(", ") : "—"}
                      </TableCell>

                      <TableCell className="text-center">
                        {delivery.deliveryCode}
                      </TableCell>

                      <TableCell className="text-center">
                        {delivery.receiptNumber}
                      </TableCell>

                      <TableCell className="text-center">
                        {delivery.totalBags}
                      </TableCell>

                      <TableCell className="text-center">
                        {delivery.totalKilos}
                      </TableCell>

                      <TableCell className="text-center">
                        {delivery.totalPieces}
                      </TableCell>

                      <TableCell className="text-center">
                        {formatPeso(delivery.totalAmount)}
                      </TableCell>

                      <TableCell className="text-center">
                        {formatDate(delivery.deliveryDate)}
                      </TableCell>

                      <TableCell className="text-center">
                        {delivery.remarks || "—"}
                      </TableCell>

                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleView(delivery)}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isDetailsLoading}
                            onClick={() => handleEdit(delivery)}
                          >
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>

                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(delivery)}
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
              {!isLoading && deliveries.length > 0 && (
                <TableFooter className="bg-slate-100 font-bold text-slate-950">
                  <TableRow>
                    <TableCell colSpan={4}>Page Total ({deliveries.length} deliveries)</TableCell>
                    <TableCell className="text-center">{deliveryTotals.bags.toLocaleString()}</TableCell>
                    <TableCell className="text-center">{deliveryTotals.kilos.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-center">{deliveryTotals.pieces.toLocaleString()}</TableCell>
                    <TableCell className="text-center">{formatPeso(deliveryTotals.amount)}</TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>

          <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {deliveries.length} of {meta.total} records
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

      <Dialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          setFormDialogOpen(open);

          if (!open) {
            resetForm();
          }
        }}
      >
        <EntryDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Delivery" : "Add Delivery"}
            </DialogTitle>

            <DialogDescription>
              {editingId
                ? "Update delivery details. Saving will recalculate totals and stock through the backend."
                : "Create a supplier delivery and add stock to bodega products."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select
                  value={form.supplierId}
                  onValueChange={(value) => updateForm("supplierId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>

                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier._id} value={supplier._id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Delivery Code</Label>
                <Input
                  value={form.deliveryCode}
                  onChange={(event) =>
                    updateForm("deliveryCode", event.target.value)
                  }
                  placeholder="Delivery code"
                />
              </div>

              <div className="space-y-2">
                <Label>Receipt Number</Label>
                <Input
                  value={form.receiptNumber}
                  onChange={(event) =>
                    updateForm("receiptNumber", event.target.value)
                  }
                  placeholder="Receipt number"
                />
              </div>

              <div className="space-y-2">
                <Label>Delivery Date</Label>
                <Input
                  type="date"
                  value={form.deliveryDate}
                  onChange={(event) =>
                    updateForm("deliveryDate", event.target.value)
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={form.remarks}
                onChange={(event) => updateForm("remarks", event.target.value)}
                placeholder="Optional remarks"
              />
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const categoryProducts = getProductsByCategory(item.categoryId);

                const selectedProduct = products.find(
                  (product) => product._id === item.bodegaProductId
                );

                const kilos = Number(item.kilos) || 0;
                const pieces = Number(item.pieces) || 0;
                const buyingPrice = Number(item.buyingPrice) || 0;
                const subtotal =
                  kilos > 0 ? kilos * buyingPrice : pieces * buyingPrice;

                return (
                  <div
                    key={index}
                    className="rounded-2xl border bg-slate-50 p-4"
                  >
                    <div className="grid gap-3 xl:grid-cols-[1.4fr_1.8fr_0.8fr_0.8fr_0.8fr_1fr_1fr_auto]">
                      <div className="space-y-1">
                        <Label>Category</Label>
                        <Select
                          value={item.categoryId}
                          onValueChange={(value) =>
                            updateItem(index, "categoryId", value)
                          }
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>

                          <SelectContent>
                            {categories.map((category) => (
                              <SelectItem
                                key={category._id}
                                value={category._id}
                              >
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label>Bodega Product</Label>
                        <Select
                          value={item.bodegaProductId}
                          onValueChange={(value) =>
                            updateItem(index, "bodegaProductId", value)
                          }
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>

                          <SelectContent>
                            {categoryProducts.map((product) => (
                              <SelectItem key={product._id} value={product._id}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {selectedProduct ? (
                          <p className="text-xs text-muted-foreground">
                            Current stock:{" "}
                            {Number(
                              selectedProduct.stockQty || 0
                            ).toLocaleString()}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-1">
                        <Label>Bags</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.bags}
                          onChange={(event) =>
                            updateItem(index, "bags", event.target.value)
                          }
                          className="bg-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label>Kilos</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.kilos}
                          onChange={(event) =>
                            updateItem(index, "kilos", event.target.value)
                          }
                          className="bg-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label>Pieces</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.pieces}
                          onChange={(event) =>
                            updateItem(index, "pieces", event.target.value)
                          }
                          className="bg-white"
                        />
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
                          X
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button type="button" variant="secondary" onClick={addItemRow}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>

            <div className="grid gap-3 rounded-xl bg-slate-900 p-4 text-white md:grid-cols-4">
              <div>
                <p className="text-xs text-white/70">Total Bags</p>
                <p className="text-xl font-bold">{totals.bags}</p>
              </div>

              <div>
                <p className="text-xs text-white/70">Total Kilos</p>
                <p className="text-xl font-bold">{totals.kilos}</p>
              </div>

              <div>
                <p className="text-xs text-white/70">Total Pieces</p>
                <p className="text-xl font-bold">{totals.pieces}</p>
              </div>

              <div>
                <p className="text-xs text-white/70">Total Amount</p>
                <p className="text-xl font-bold">{formatPeso(totals.amount)}</p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => setFormDialogOpen(false)}
              >
                Cancel
              </Button>

              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {editingId ? "Save" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </EntryDialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Delivery Details</DialogTitle>
            <DialogDescription>
              View delivery item details and totals.
            </DialogDescription>
          </DialogHeader>

          {viewData ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg bg-slate-100 p-4 text-sm md:grid-cols-2">
                <p>
                  <strong>Supplier:</strong> {viewData.supplierName || "—"}
                </p>

                <p>
                  <strong>Delivery Code:</strong>{" "}
                  {viewData.deliveryCode || "—"}
                </p>

                <p>
                  <strong>Receipt #:</strong>{" "}
                  {viewData.receiptNumber || "—"}
                </p>

                <p>
                  <strong>Date:</strong> {formatDate(viewData.deliveryDate)}
                </p>

                <p>
                  <strong>Total Amount:</strong>{" "}
                  {formatPeso(Number(viewData.totalAmount || 0))}
                </p>

                <p>
                  <strong>Remarks:</strong> {viewData.remarks || "—"}
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader className="bg-slate-900">
                    <TableRow>
                      <TableHead className="text-white">Product</TableHead>
                      <TableHead className="text-right text-white">
                        Bags
                      </TableHead>
                      <TableHead className="text-right text-white">
                        Kilos
                      </TableHead>
                      <TableHead className="text-right text-white">
                        Pieces
                      </TableHead>
                      <TableHead className="text-right text-white">
                        Buying Price
                      </TableHead>
                      <TableHead className="text-right text-white">
                        Amount
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {(viewData.items || viewData.lines || []).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No delivery item details found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (viewData.items || viewData.lines || []).map(
                        (line: any, index: number) => (
                          <TableRow key={line._id || index}>
                            <TableCell>
                              {line.productName ||
                                line.bodegaProductName ||
                                line.name ||
                                "—"}
                            </TableCell>

                            <TableCell className="text-right">
                              {Number(line.bags || 0)}
                            </TableCell>

                            <TableCell className="text-right">
                              {Number(line.kilos || 0)}
                            </TableCell>

                            <TableCell className="text-right">
                              {Number(line.pieces || 0)}
                            </TableCell>

                            <TableCell className="text-right">
                              {formatPeso(Number(line.buyingPrice || 0))}
                            </TableCell>

                            <TableCell className="text-right">
                              {formatPeso(
                                Number(line.totalAmount || line.lineTotal || 0)
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      )
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
