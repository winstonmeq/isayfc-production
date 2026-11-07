"use client";

import { readApiResponse } from "@/lib/api-response";
import { EntryDialogContent } from "@/components/erp/EntryForm";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Check,
  ChevronsUpDown,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  Search,
  Send,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import {
  StatusBadge,
  TransferDetailDialog,
  type TransferDetail,
  type TransferRow,
} from "@/components/stock-transfers/TransferShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { canCreateManualOutletDelivery } from "@/lib/outlet-delivery-policy";

type OutletOption = { _id: string; name: string; code: string };

type ProductOption = {
  key: string;
  source: "BODEGA" | "GROCERY";
  id: string;
  name: string;
  standardPackingId?: string;
  packingLabel?: string;
  stock: number;
  packSize: number;
  unitLabel: "PACK" | "HEAD" | "PCS" | "QTY";
  stockDisplay: string;
  sellingPrice: number;
};

type ApiMeta = { page: number; limit: number; total: number; totalPages: number };

type FormItem = { key: string; qty: string; kilosOut?: string };

function TransferProductPicker({
  products,
  value,
  onSelect,
}: {
  products: ProductOption[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find((product) => product.key === value);

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
            {selected
              ? `${selected.name} — ${selected.source === "BODEGA" ? "Bodega" : "Grocery"}`
              : "Search product..."}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[620px] max-w-[calc(100vw-2rem)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search bodega or grocery product..." />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
            <CommandGroup>
              {products.map((product) => (
                <CommandItem
                  key={product.key}
                  value={`${product.name} ${product.source} ${product.packingLabel || ""} ${product.stockDisplay}`}
                  onSelect={() => {
                    onSelect(product.key);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 size-4 shrink-0",
                      value === product.key ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{product.name}</span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                        {product.source === "BODEGA" ? "Bodega" : "Grocery"}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {product.unitLabel === "PACK" && product.packingLabel
                        ? `${product.packingLabel}/pack · `
                        : ""}
                      {product.stockDisplay}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const STATUS_OPTIONS = [
  "ALL",
  "DRAFT",
  "IN_TRANSIT",
  "DELIVERED",
  "CONFIRMED",
  "CANCELLED",
];

function formatDate(value?: string) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function StockTransfersPageClient() {
  const { data: session } = useSession();
  const canCreateManual = canCreateManualOutletDelivery({
    role: session?.user?.role,
    roleName: session?.user?.roleName,
  });
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [meta, setMeta] = useState<ApiMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [outletFilter, setOutletFilter] = useState("ALL");
  const [discrepancyOnly, setDiscrepancyOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  // Create / edit dialog state.
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOutletId, setFormOutletId] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formRemarks, setFormRemarks] = useState("");
  const [formItems, setFormItems] = useState<FormItem[]>([
    { key: "", qty: "" },
  ]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Detail dialog state.
  const [detail, setDetail] = useState<TransferDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const productByKey = useMemo(() => {
    const map = new Map<string, ProductOption>();
    for (const product of products) map.set(product.key, product);
    return map;
  }, [products]);

  const loadTransfers = useCallback(async () => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({ page: String(page), limit: "10" });

      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (outletFilter !== "ALL") params.set("outletId", outletFilter);
      if (discrepancyOnly) params.set("discrepancyOnly", "true");
      if (appliedSearch) params.set("search", appliedSearch);

      const res = await fetch(`/api/stock-transfers?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await readApiResponse<any>(res);

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Unable to load stock transfers.");
      }

      setTransfers(Array.isArray(json.data) ? json.data : []);
      setOutlets(Array.isArray(json.outlets) ? json.outlets : []);
      setMeta(json.meta || { page, limit: 10, total: 0, totalPages: 1 });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load stock transfers."
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, outletFilter, discrepancyOnly, appliedSearch]);

  useEffect(() => {
    void loadTransfers();
  }, [loadTransfers]);

  async function loadProducts() {
    try {
      async function loadAllPages(endpoint: string) {
        const loadPage = async (page: number) => {
          const separator = endpoint.includes("?") ? "&" : "?";
          const response = await fetch(
            `${endpoint}${separator}page=${page}&limit=100`,
            { cache: "no-store" }
          );
          const json = await readApiResponse<any>(response);

          if (!response.ok || !json.success) {
            throw new Error(json.message || "Unable to load products.");
          }

          return json;
        };

        const firstPage = await loadPage(1);
        const totalPages = Math.max(Number(firstPage.meta?.totalPages || 1), 1);
        const remainingPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            loadPage(index + 2)
          )
        );

        return [
          ...(Array.isArray(firstPage.data) ? firstPage.data : []),
          ...remainingPages.flatMap((page) =>
            Array.isArray(page.data) ? page.data : []
          ),
        ];
      }

      const [bodegaProducts, groceryProducts] = await Promise.all([
        loadAllPages("/api/bodega-products"),
        loadAllPages("/api/products"),
      ]);

      const options: ProductOption[] = [];

      for (const p of bodegaProducts as Array<{
          _id: string;
          name: string;
          stockQty?: number;
          sellingPrice?: number;
          baseUnit?: "HEAD" | "PCS";
          packSize?: number;
          stockDisplay?: string;
          packingOptions?: Array<{
            _id: string;
            packSize?: number;
            chickenSizeType?: string;
            wholeChickenName?: string;
          }>;
        }>) {
          const stock = Number(p.stockQty || 0);
          const packing = Array.isArray(p.packingOptions)
            ? p.packingOptions.find(
                (option) => Number(option.packSize || 0) > 0
              )
            : undefined;
          const packSize = Math.max(
            0,
            Math.trunc(Number(packing?.packSize || p.packSize || 0))
          );
          const packingLabel =
            packing?.wholeChickenName || packing?.chickenSizeType || undefined;

          options.push({
            key: `BODEGA:${p._id}`,
            source: "BODEGA",
            id: p._id,
            name: p.name,
            sellingPrice: Number(p.sellingPrice || 0),
            standardPackingId: packing?._id,
            packingLabel,
            stock,
            packSize,
            unitLabel: packSize > 0 ? "PACK" : p.baseUnit === "HEAD" ? "HEAD" : "PCS",
            stockDisplay:
              p.stockDisplay ||
              (packSize > 0
                ? `${Math.floor(stock / packSize)} pack(s) + ${stock % packSize} pcs`
                : `${stock} ${p.baseUnit === "HEAD" ? "head(s)" : "pcs"}`),
          });
      }

      for (const p of groceryProducts as Array<{
          _id: string;
          name: string;
          stockPcs?: number;
          unitPrice?: number;
        }>) {
          const stock = Number(p.stockPcs || 0);

          options.push({
            key: `GROCERY:${p._id}`,
            source: "GROCERY",
            id: p._id,
            name: p.name,
            stock,
            sellingPrice: Number(p.unitPrice || 0),
            packSize: 0,
            unitLabel: "QTY",
            stockDisplay: `${stock} in stock`,
          });
      }

      setProducts(options);
    } catch {
      toast.error("Unable to load product list.");
    }
  }

  function openCreate() {
    setEditingId(null);
    setFormOutletId("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormRemarks("");
    setFormItems([{ key: "", qty: "" }]);
    setIsFormOpen(true);
    void loadProducts();
  }

  async function openEdit(transferId: string) {
    setIsDetailLoading(true);

    try {
      const res = await fetch(`/api/stock-transfers/${transferId}`, {
        cache: "no-store",
      });
      const json = await readApiResponse<any>(res);

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Unable to load transfer.");
      }

      const data: TransferDetail = json.data;

      setEditingId(transferId);
      setFormOutletId(data.outletId);
      setFormDate(data.transferDate ? data.transferDate.slice(0, 10) : "");
      setFormRemarks(data.remarks || "");
      setFormItems(
        data.items.map((item) => ({
          key:
            item.source === "GROCERY"
              ? `GROCERY:${item.productId}`
              : `BODEGA:${item.bodegaProductId}`,
          qty: String(item.qty),
        }))
      );
      setIsFormOpen(true);
      void loadProducts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load transfer."
      );
    } finally {
      setIsDetailLoading(false);
    }
  }

  function updateItem(index: number, patch: Partial<FormItem>) {
    setFormItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  }

  async function submitForm(dispatchNow: boolean) {
    const items = formItems
      .filter((item) => item.key)
      .map((item) => {
        const product = productByKey.get(item.key);

        return {
          source: product?.source || "BODEGA",
          bodegaProductId: product?.source === "BODEGA" ? product.id : undefined,
          productId: product?.source === "GROCERY" ? product.id : undefined,
          standardPackingId:
            product?.source === "BODEGA"
              ? product.standardPackingId
              : undefined,
          qty: Number(item.qty),
          kilosOut: item.kilosOut ? Number(item.kilosOut) : undefined,
        };
      });

    if (!formOutletId) {
      toast.error("Please select an outlet.");
      return;
    }

    if (items.length === 0) {
      toast.error("Please add at least one product.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        outletId: formOutletId,
        transferDate: formDate,
        remarks: formRemarks,
        items,
        dispatch: dispatchNow,
      };

      const res = editingId
        ? await fetch(`/api/stock-transfers/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/stock-transfers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const json = await readApiResponse<any>(res);

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Unable to save transfer.");
      }

      // Editing never dispatches in the same call; dispatch separately.
      if (editingId && dispatchNow) {
        const dispatchRes = await fetch(
          `/api/stock-transfers/${editingId}/dispatch`,
          { method: "POST" }
        );
        const dispatchJson = await readApiResponse<any>(dispatchRes);

        if (!dispatchRes.ok || !dispatchJson.success) {
          throw new Error(dispatchJson.message || "Saved, but dispatch failed.");
        }

        toast.success(dispatchJson.message);
      } else {
        toast.success(json.message);
      }

      setIsFormOpen(false);
      void loadTransfers();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save transfer."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function runAction(
    transferId: string,
    action: "dispatch" | "cancel",
    confirmMessage: string
  ) {
    if (!window.confirm(confirmMessage)) return;

    setActionBusyId(transferId);

    try {
      const res =
        action === "dispatch"
          ? await fetch(`/api/stock-transfers/${transferId}/dispatch`, {
              method: "POST",
            })
          : await fetch(`/api/stock-transfers/${transferId}`, {
              method: "DELETE",
            });

      const json = await readApiResponse<any>(res);

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Action failed.");
      }

      toast.success(json.message);
      void loadTransfers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function openDetail(transferId: string) {
    setIsDetailLoading(true);

    try {
      const res = await fetch(`/api/stock-transfers/${transferId}`, {
        cache: "no-store",
      });
      const json = await readApiResponse<any>(res);

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Unable to load transfer.");
      }

      setDetail(json.data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load transfer."
      );
    } finally {
      setIsDetailLoading(false);
    }
  }

  return (
    <div>
      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setPage(1);
                setStatusFilter(value);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "ALL"
                      ? "All statuses"
                      : status === "IN_TRANSIT"
                        ? "In Transit (Pending Delivery)"
                        : status.charAt(0) + status.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Outlet</Label>
            <Select
              value={outletFilter}
              onValueChange={(value) => {
                setPage(1);
                setOutletFilter(value);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All outlets</SelectItem>
                {outlets.map((outlet) => (
                  <SelectItem key={outlet._id} value={outlet._id}>
                    {outlet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Transfer #</Label>
            <div className="flex gap-2">
              <Input
                placeholder="TRF-..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setPage(1);
                    setAppliedSearch(search.trim());
                  }
                }}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setPage(1);
                  setAppliedSearch(search.trim());
                }}
              >
                <Search className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <Button
              variant={discrepancyOnly ? "default" : "outline"}
              onClick={() => {
                setPage(1);
                setDiscrepancyOnly((current) => !current);
              }}
            >
              Discrepancies only
            </Button>
            <Button
              variant="outline"
              onClick={() => void loadTransfers()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCcw className="size-4" />
              )}
              Refresh
            </Button>
            {canCreateManual ? <Button onClick={openCreate} title="Administrator exception only">
              <Plus className="size-4" />
              Admin Manual Delivery
            </Button> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delivery #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Qty Sent</TableHead>
                <TableHead className="text-right">Qty Received</TableHead>
                <TableHead className="text-right">Transaction Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && transfers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : transfers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="py-10 text-center text-slate-500"
                  >
                    <Truck className="mx-auto mb-2 size-6" />
                    No outlet deliveries found.
                  </TableCell>
                </TableRow>
              ) : (
                transfers.map((transfer) => (
                  <TableRow key={transfer._id}>
                    <TableCell className="font-medium">
                      {transfer.transferNumber}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(transfer.transferDate)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {transfer.outletName}
                      <span className="block text-xs text-slate-500">Category: OUTLET</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={transfer.saleId ? "default" : "secondary"}>
                        {transfer.saleId ? "Outlet Sale" : "Admin Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {transfer.totalItems}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {transfer.totalQty}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {transfer.status === "CONFIRMED"
                        ? transfer.totalReceivedQty
                        : "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">₱{Number(transfer.transactionAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge status={transfer.status} />
                        {transfer.hasDiscrepancy ? (
                          <Badge className="bg-amber-100 text-amber-700">
                            Discrepancy
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View details"
                          onClick={() => void openDetail(transfer._id)}
                          disabled={isDetailLoading}
                        >
                          <Eye className="size-4" />
                        </Button>

                        {transfer.status !== "DRAFT" &&
                        transfer.status !== "CANCELLED" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Print delivery receipt"
                            asChild
                          >
                            <Link
                              href={`/stock-transfers/${transfer._id}/print`}
                              target="_blank"
                            >
                              <Printer className="size-4" />
                            </Link>
                          </Button>
                        ) : null}

                        {transfer.status === "DRAFT" ? (
                          <>
                            {canCreateManual && !transfer.saleId ? <Button
                              variant="ghost"
                              size="icon"
                              title="Edit draft"
                              onClick={() => void openEdit(transfer._id)}
                            >
                              <Pencil className="size-4" />
                            </Button> : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Dispatch (deduct bodega stock)"
                              disabled={actionBusyId === transfer._id}
                              onClick={() =>
                                void runAction(
                                  transfer._id,
                                  "dispatch",
                                  `Dispatch ${transfer.transferNumber}? Bodega stock will be deducted.`
                                )
                              }
                            >
                              <Send className="size-4" />
                            </Button>
                          </>
                        ) : null}

                        {transfer.status === "DRAFT" ||
                        transfer.status === "IN_TRANSIT" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Cancel transfer"
                            disabled={actionBusyId === transfer._id}
                            onClick={() =>
                              void runAction(
                                transfer._id,
                                "cancel",
                                transfer.status === "IN_TRANSIT"
                                  ? `Cancel ${transfer.transferNumber}? The dispatched stock will be returned to the bodega.`
                                  : `Cancel draft ${transfer.transferNumber}?`
                              )
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-sm text-slate-500">
              {meta.total.toLocaleString("en-PH")} deliveries · Page {meta.page} of{" "}
              {meta.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.totalPages || isLoading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <EntryDialogContent className="max-h-[92vh] w-[95vw] max-w-[95vw] overflow-y-auto sm:max-w-3xl lg:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Manual Delivery" : "Administrator Manual Delivery"}
            </DialogTitle>
            <DialogDescription>
              Exception workflow only. Normal outlet deliveries must be generated
              from an outlet customer sale. Select the outlet and products to transfer. Products come directly
              from the Bodega and Grocery product masters. Pack products are
              entered in packs; other products use their inventory quantity.
              Stock is only deducted when dispatched.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Outlet</Label>
                <Select value={formOutletId} onValueChange={setFormOutletId}>
                  <SelectTrigger>
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

              <div className="space-y-1.5">
                <Label>Transfer date</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(event) => setFormDate(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Products</Label>

              <div className="hidden gap-2 px-1 text-xs font-semibold text-slate-500 sm:grid sm:grid-cols-[minmax(200px,1fr)_160px_120px_140px_40px]">
                <span>Product</span>
                <span>Quantity</span>
                <span>Unit Price</span>
                <span>Line Amount</span>
                <span />
              </div>

              {formItems.map((item, index) => {
                const selected = productByKey.get(item.key);
                const isPack = selected?.unitLabel === "PACK";
                const qtyNum = Number(item.qty);
                const pcsPreview =
                  isPack && Number.isFinite(qtyNum) && qtyNum > 0
                    ? qtyNum * (selected?.packSize || 0)
                    : 0;

                return (
                  <div
                    key={index}
                    className="grid items-start gap-2 sm:grid-cols-[minmax(200px,1fr)_160px_120px_140px_40px]"
                  >
                    <div>
                      <TransferProductPicker
                        products={products}
                        value={item.key}
                        onSelect={(value) =>
                          updateItem(index, { key: value })
                        }
                      />
                      {selected ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Available: {selected.stockDisplay}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          placeholder="Qty"
                          value={item.qty}
                          onChange={(event) =>
                            updateItem(index, { qty: event.target.value })
                          }
                        />
                        <span className="w-12 shrink-0 text-sm text-slate-500">
                          {isPack
                            ? "packs"
                            : selected?.unitLabel === "QTY"
                              ? "units"
                              : selected?.unitLabel === "HEAD"
                                ? "heads"
                              : selected
                                ? "pcs"
                                : ""}
                        </span>
                      </div>
                      {selected?.unitLabel === "HEAD" && <label className="text-xs">Actual Kilos<Input type="number" min="0" step="any" value={item.kilosOut || ""} onChange={event => updateItem(index, { kilosOut: event.target.value })} /></label>}
                      {pcsPreview > 0 ? (
                        <p className="mt-1 text-xs text-slate-500">
                          = {pcsPreview} pcs
                        </p>
                      ) : null}
                    </div>

                    <div className="py-3 text-sm tabular-nums"><span className="sm:hidden">Unit Price: </span>₱{Number(selected?.sellingPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="block text-xs text-slate-500">per {isPack ? "pack" : selected?.unitLabel === "HEAD" ? "head" : "unit"}</span></div>
                    <div className="py-3 font-semibold tabular-nums"><span className="sm:hidden">Amount: </span>₱{((Number(selected?.sellingPrice) || 0) * (Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setFormItems((current) =>
                          current.length > 1
                            ? current.filter((_, i) => i !== index)
                            : current
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormItems((current) => [...current, { key: "", qty: "" }])
                }
              >
                <Plus className="size-4" />
                Add product
              </Button>
            </div>

            <div className="flex justify-between rounded-lg border bg-slate-50 p-4 font-bold"><span>Total Delivery Amount</span><span>₱{formItems.reduce((sum, item) => sum + (Number(productByKey.get(item.key)?.sellingPrice) || 0) * Math.max(0, Number(item.qty) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Textarea
                rows={2}
                value={formRemarks}
                onChange={(event) => setFormRemarks(event.target.value)}
                placeholder="Optional notes for this delivery order"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => void submitForm(false)}
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save as Draft
            </Button>
            <Button disabled={isSaving} onClick={() => void submitForm(true)}>
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Save & Dispatch
            </Button>
          </DialogFooter>
        </EntryDialogContent>
      </Dialog>

      <TransferDetailDialog detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
