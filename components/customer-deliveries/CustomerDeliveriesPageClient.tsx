"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  PackagePlus,
  RefreshCcw,
  UserPlus,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import {
  ErpEmptyState,
  ErpField,
  ErpKeyValue,
  ErpMetricCard,
  ErpMobileCard,
  ErpPage,
  ErpPageHeader,
  ErpSection,
  ErpToolbar,
} from "@/components/erp/ErpShell";
import { PackStockDisplay, numberValue, wholeNumber } from "@/components/erp/StockDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatPeso } from "@/lib/utils";

type CustomerOption = {
  _id: string;
  name: string;
  phone?: string;
  address?: string;
  type?: string;
};

type OutletOption = {
  _id: string;
  name: string;
  code?: string;
  address?: string;
  managerName?: string;
  contactNumber?: string;
};

type BodegaProductOption = {
  _id: string;
  name: string;
  categoryName?: string;
  stockQty?: number;
  stockPcs?: number;
  stockPacks?: number;
  stockLoosePcs?: number;
  packSize?: number;
  sellingPrice?: number;
  pricePerPack?: number;
  pricePerPcs?: number;
};

type ProductOption = {
  _id: string;
  name: string;
  categoryName?: string;
  stockPcs?: number;
  unitPrice?: number;
};

type DeliveryStatus = "PENDING" | "CONFIRMED" | "CANCELLED";
type DeliveryCategory = "DELIVER" | "PICKUP";
type DeliveryItemSource = "BODEGA" | "GROCERY";

type DeliveryRow = {
  _id: string;
  deliveryCode: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  outletId?: string;
  outletName?: string;
  outletCode?: string;
  category: DeliveryCategory;
  status: DeliveryStatus;
  requestDate?: string;
  scheduledDate?: string;
  confirmedAt?: string;
  totalItems: number;
  totalQty: number;
  totalAmount: number;
  remarks?: string;
};

type Summary = {
  rows: number;
  pending: number;
  confirmed: number;
  cancelled: number;
  totalQty: number;
  totalAmount: number;
};

type FormItem = {
  source: DeliveryItemSource;
  productId: string;
  qty: string;
  remarks: string;
};

const emptyItem: FormItem = {
  source: "BODEGA",
  productId: "",
  qty: "1",
  remarks: "",
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

function statusBadge(status: DeliveryStatus) {
  if (status === "CONFIRMED") {
    return <Badge className="rounded-full bg-emerald-600 text-white hover:bg-emerald-600">Confirmed</Badge>;
  }

  if (status === "CANCELLED") {
    return <Badge variant="destructive" className="rounded-full">Cancelled</Badge>;
  }

  return <Badge variant="secondary" className="rounded-full">Pending</Badge>;
}

function categoryBadge(category: DeliveryCategory) {
  return category === "PICKUP" ? (
    <Badge variant="outline" className="rounded-full border-blue-200 bg-blue-50 text-blue-700">Pickup</Badge>
  ) : (
    <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">Deliver</Badge>
  );
}

function getBodegaStock(product?: BodegaProductOption) {
  return numberValue(product?.stockPcs ?? product?.stockQty);
}

function getBodegaPackSize(product?: BodegaProductOption) {
  return wholeNumber(product?.packSize);
}

function getBodegaPrice(product?: BodegaProductOption) {
  return numberValue(product?.pricePerPack || product?.sellingPrice);
}

function getProductPrice(product?: ProductOption) {
  return numberValue(product?.unitPrice);
}

export function CustomerDeliveriesPageClient() {
  const generatedDeliveryId = useId().replace(/[^a-zA-Z0-9]/g, "").slice(-6);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [bodegaProducts, setBodegaProducts] = useState<BodegaProductOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [records, setRecords] = useState<DeliveryRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    rows: 0,
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    totalQty: 0,
    totalAmount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState("");

  const [filters, setFilters] = useState({
    search: "",
    customerId: "ALL",
    outletId: "ALL",
    status: "ALL",
    category: "ALL",
    dateFrom: todayString(),
    dateTo: todayString(),
  });

  const [form, setForm] = useState({
    deliveryCode: `CD-${generatedDeliveryId}`,
    customerId: "",
    outletId: "",
    category: "DELIVER" as DeliveryCategory,
    requestDate: todayString(),
    scheduledDate: todayString(),
    remarks: "",
  });

  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    name: "",
    phone: "",
    address: "",
    type: "BOTH",
  });

  const [items, setItems] = useState<FormItem[]>([{ ...emptyItem }]);

  const formTotals = useMemo(() => {
    return items.reduce(
      (sum, item) => {
        const qty = numberValue(item.qty);

        if (item.source === "BODEGA") {
          const product = bodegaProducts.find((entry) => entry._id === item.productId);
          const packSize = getBodegaPackSize(product);
          const stockOut = packSize > 0 ? qty * packSize : qty;
          const price = getBodegaPrice(product);

          return {
            totalQty: sum.totalQty + stockOut,
            totalAmount: sum.totalAmount + qty * price,
          };
        }

        const product = products.find((entry) => entry._id === item.productId);
        const price = getProductPrice(product);

        return {
          totalQty: sum.totalQty + qty,
          totalAmount: sum.totalAmount + qty * price,
        };
      },
      { totalQty: 0, totalAmount: 0 }
    );
  }, [items, bodegaProducts, products]);

  const selectedCustomer = customers.find((customer) => customer._id === form.customerId);
  const selectedOutlet = outlets.find((outlet) => outlet._id === form.outletId);

  async function loadOptions() {
    const res = await fetch("/api/customer-deliveries/options", { cache: "no-store" });
    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to load customer delivery options.");
    }

    setCustomers(json.data?.customers || []);
    setOutlets(json.data?.outlets || []);
    setBodegaProducts(json.data?.bodegaProducts || []);
    setProducts(json.data?.products || []);
  }

  async function loadRecords() {
    const params = new URLSearchParams();
    params.set("limit", "50");

    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.customerId !== "ALL") params.set("customerId", filters.customerId);
    if (filters.outletId !== "ALL") params.set("outletId", filters.outletId);
    if (filters.status !== "ALL") params.set("status", filters.status);
    if (filters.category !== "ALL") params.set("category", filters.category);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);

    const res = await fetch(`/api/customer-deliveries?${params.toString()}`, {
      cache: "no-store",
    });
    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to load customer deliveries.");
    }

    setRecords(json.data || []);
    setSummary(json.summary || summary);
  }

  async function loadPage() {
    setIsLoading(true);

    try {
      await Promise.all([loadOptions(), loadRecords()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load customer deliveries.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateItem(index: number, field: keyof FormItem, value: string) {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        if (field === "source") {
          return {
            ...item,
            source: value === "GROCERY" ? "GROCERY" : "BODEGA",
            productId: "",
          };
        }

        return {
          ...item,
          [field]: value,
        };
      })
    );
  }

  function addItem() {
    setItems((current) => [...current, { ...emptyItem }]);
  }

  function removeItem(index: number) {
    setItems((current) => (current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)));
  }

  async function saveCustomer() {
    if (!customerForm.name.trim()) {
      toast.error("Customer name is required.");
      return;
    }

    setIsSavingCustomer(true);

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customerForm.name,
          phone: customerForm.phone,
          address: customerForm.address,
          type: customerForm.type,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to add customer.");
      }

      const customer = json.data as CustomerOption;
      const normalizedCustomer: CustomerOption = {
        _id: customer._id,
        name: customer.name || customerForm.name.toUpperCase(),
        phone: customer.phone || customerForm.phone,
        address: customer.address || customerForm.address.toUpperCase(),
        type: customer.type || customerForm.type,
      };

      setCustomers((current) => {
        const exists = current.some((entry) => entry._id === normalizedCustomer._id);
        return exists
          ? current.map((entry) => (entry._id === normalizedCustomer._id ? normalizedCustomer : entry))
          : [...current, normalizedCustomer].sort((a, b) => a.name.localeCompare(b.name));
      });
      setForm((current) => ({ ...current, customerId: normalizedCustomer._id }));
      setCustomerForm({ name: "", phone: "", address: "", type: "BOTH" });
      setShowCustomerForm(false);
      toast.success("Customer added and selected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add customer.");
    } finally {
      setIsSavingCustomer(false);
    }
  }

  async function saveDelivery() {
    if (!form.deliveryCode.trim()) {
      toast.error("Delivery code is required.");
      return;
    }

    if (!form.customerId) {
      toast.error("Select a customer.");
      return;
    }

    if (!form.outletId) {
      toast.error("Select an outlet to receive this delivery.");
      return;
    }

    const validItems = items.filter((item) => item.productId && numberValue(item.qty) > 0);

    if (validItems.length === 0) {
      toast.error("Add at least one valid item.");
      return;
    }

    setIsSaving(true);

    try {
      const res = await fetch("/api/customer-deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          items: validItems.map((item) => ({
            source: item.source,
            productId: item.productId,
            bodegaProductId: item.source === "BODEGA" ? item.productId : undefined,
            qty: numberValue(item.qty),
            remarks: item.remarks,
          })),
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save customer delivery.");
      }

      toast.success(json.message || "Customer delivery saved.");
      setForm({
        deliveryCode: `CD-${Date.now().toString().slice(-6)}`,
        customerId: "",
        outletId: "",
        category: "DELIVER",
        requestDate: todayString(),
        scheduledDate: todayString(),
        remarks: "",
      });
      setItems([{ ...emptyItem }]);
      await loadRecords();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save customer delivery.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelivery(record: DeliveryRow) {
    const ok = window.confirm(
      `Confirm ${record.deliveryCode}? This will deduct main inventory and add items to the selected outlet inventory.`
    );

    if (!ok) return;

    setConfirmingId(record._id);

    try {
      const res = await fetch(`/api/customer-deliveries/${record._id}/confirm`, {
        method: "POST",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to confirm customer delivery.");
      }

      toast.success(json.message || "Customer delivery confirmed.");
      await Promise.all([loadRecords(), loadOptions()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to confirm customer delivery.");
    } finally {
      setConfirmingId("");
    }
  }

  async function cancelDelivery(record: DeliveryRow) {
    const ok = window.confirm(`Cancel ${record.deliveryCode}?`);
    if (!ok) return;

    try {
      const res = await fetch(`/api/customer-deliveries/${record._id}`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to cancel customer delivery.");
      }

      toast.success(json.message || "Customer delivery cancelled.");
      await loadRecords();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel customer delivery.");
    }
  }

  return (
    <ErpPage>
      <ErpPageHeader
        eyebrow="Customer operations"
        title="Customer Deliveries"
        description="Create delivery or pickup orders for customers/outlets. Confirmation deducts main stock and adds items to outlet inventory for Flutter POS sync."
        actions={
          <Button variant="outline" onClick={() => void loadPage()} disabled={isLoading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ErpMetricCard label="Filtered Orders" value={summary.rows.toLocaleString()} icon={<Truck className="h-5 w-5" />} />
        <ErpMetricCard label="Pending" value={summary.pending.toLocaleString()} tone="amber" />
        <ErpMetricCard label="Confirmed" value={summary.confirmed.toLocaleString()} tone="emerald" />
        <ErpMetricCard label="Total Amount" value={formatPeso(summary.totalAmount)} tone="blue" />
      </div>

      <ErpSection title="Create customer delivery" description="Use Deliver for rider delivery and Pickup for customer pickup.">
        <div className="grid gap-4 lg:grid-cols-4">
          <ErpField label="Delivery Code">
            <Input
              value={form.deliveryCode}
              onChange={(event) => setForm((current) => ({ ...current, deliveryCode: event.target.value }))}
            />
          </ErpField>
          <ErpField label="Customer">
            <div className="space-y-2">
              <div className="flex gap-2">
                <Select
                  value={form.customerId}
                  onValueChange={(value) => setForm((current) => ({ ...current, customerId: value }))}
                >
                  <SelectTrigger className="min-w-0 flex-1">
                    <SelectValue placeholder={customers.length ? "Select customer" : "No customers found"} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer._id} value={customer._id}>
                        {customer.name} {customer.type ? `(${customer.type})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => setShowCustomerForm((current) => !current)}
                  title="Add customer"
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
              {selectedCustomer ? (
                <div className="rounded-xl border bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-900">{selectedCustomer.name}</div>
                  <div>{selectedCustomer.phone || "No phone"} • {selectedCustomer.address || "No address"}</div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Select an existing customer or use the + button to add one.</p>
              )}
            </div>
          </ErpField>
          <ErpField label="Outlet Receiver">
            <div className="space-y-2">
              <Select
                value={form.outletId}
                onValueChange={(value) => setForm((current) => ({ ...current, outletId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={outlets.length ? "Select outlet" : "No outlets found"} />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((outlet) => (
                    <SelectItem key={outlet._id} value={outlet._id}>
                      {outlet.name} {outlet.code ? `(${outlet.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOutlet ? (
                <p className="text-xs text-slate-500">{selectedOutlet.address || "No outlet address"}</p>
              ) : (
                <p className="text-xs text-slate-500">Confirmed items will be added to this outlet inventory.</p>
              )}
            </div>
          </ErpField>
          <ErpField label="Category">
            <Select
              value={form.category}
              onValueChange={(value) => setForm((current) => ({ ...current, category: value as DeliveryCategory }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DELIVER">Deliver</SelectItem>
                <SelectItem value="PICKUP">Pickup</SelectItem>
              </SelectContent>
            </Select>
          </ErpField>
          <ErpField label="Request Date">
            <Input
              type="date"
              value={form.requestDate}
              onChange={(event) => setForm((current) => ({ ...current, requestDate: event.target.value }))}
            />
          </ErpField>
          <ErpField label="Scheduled Date">
            <Input
              type="date"
              value={form.scheduledDate}
              onChange={(event) => setForm((current) => ({ ...current, scheduledDate: event.target.value }))}
            />
          </ErpField>
          <ErpField label="Remarks" className="lg:col-span-3">
            <Input
              value={form.remarks}
              onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
              placeholder="Optional delivery notes"
            />
          </ErpField>
        </div>

        {showCustomerForm ? (
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-black text-slate-950">Quick Add Customer</div>
                <p className="text-xs text-slate-600">Add a customer here, then the system will select it for this delivery.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCustomerForm(false)}>
                Close
              </Button>
            </div>
            <div className="grid gap-3 lg:grid-cols-4">
              <ErpField label="Customer Name">
                <Input
                  value={customerForm.name}
                  onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Customer name"
                />
              </ErpField>
              <ErpField label="Phone">
                <Input
                  value={customerForm.phone}
                  onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="Phone number"
                />
              </ErpField>
              <ErpField label="Address">
                <Input
                  value={customerForm.address}
                  onChange={(event) => setCustomerForm((current) => ({ ...current, address: event.target.value }))}
                  placeholder="Delivery address"
                />
              </ErpField>
              <ErpField label="Customer Type">
                <Select
                  value={customerForm.type}
                  onValueChange={(value) => setCustomerForm((current) => ({ ...current, type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SALE">Sale</SelectItem>
                    <SelectItem value="DELIVERY">Delivery</SelectItem>
                    <SelectItem value="BOTH">Sale + Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </ErpField>
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="button" onClick={() => void saveCustomer()} disabled={isSavingCustomer}>
                {isSavingCustomer ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Add and Select Customer
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {items.map((item, index) => {
            const bodegaProduct = bodegaProducts.find((entry) => entry._id === item.productId);
            const groceryProduct = products.find((entry) => entry._id === item.productId);

            return (
              <Card key={index} className="rounded-2xl border-slate-200 shadow-sm">
                <CardContent className="grid gap-3 p-4 lg:grid-cols-12 lg:items-end">
                  <div className="lg:col-span-2">
                    <Label>Source</Label>
                    <Select value={item.source} onValueChange={(value) => updateItem(index, "source", value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BODEGA">Bodega</SelectItem>
                        <SelectItem value="GROCERY">Grocery/Product</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="lg:col-span-4">
                    <Label>Product</Label>
                    <Select value={item.productId} onValueChange={(value) => updateItem(index, "productId", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {item.source === "BODEGA"
                          ? bodegaProducts.map((product) => (
                              <SelectItem key={product._id} value={product._id}>
                                {product.name}
                              </SelectItem>
                            ))
                          : products.map((product) => (
                              <SelectItem key={product._id} value={product._id}>
                                {product.name}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="lg:col-span-2">
                    <Label>{item.source === "BODEGA" && getBodegaPackSize(bodegaProduct) > 0 ? "Qty Packs" : "Qty"}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={item.qty}
                      onChange={(event) => updateItem(index, "qty", event.target.value)}
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <Label>Stock / Price</Label>
                    <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm">
                      {item.source === "BODEGA" ? (
                        <div className="space-y-1">
                          <PackStockDisplay stockPcs={getBodegaStock(bodegaProduct)} packSize={getBodegaPackSize(bodegaProduct)} compact />
                          <div className="text-xs text-slate-500">{formatPeso(getBodegaPrice(bodegaProduct))} / {getBodegaPackSize(bodegaProduct) > 0 ? "pack" : "qty"}</div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="font-black text-slate-950">{numberValue(groceryProduct?.stockPcs).toLocaleString()} pcs</div>
                          <div className="text-xs text-slate-500">{formatPeso(getProductPrice(groceryProduct))} / qty</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end lg:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(index)}
                      disabled={items.length === 1}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-slate-600">
            Estimated total: <span className="font-black text-slate-950">{formatPeso(formTotals.totalAmount)}</span> • Stock movement: <span className="font-black text-slate-950">{formTotals.totalQty.toLocaleString()} pcs/qty</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={addItem}>
              <PackagePlus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
            <Button type="button" onClick={saveDelivery} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
              Save Delivery
            </Button>
          </div>
        </div>
      </ErpSection>

      <ErpToolbar>
        <ErpField label="Search Code">
          <Input
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="CD-000001"
          />
        </ErpField>
        <ErpField label="Customer">
          <Select value={filters.customerId} onValueChange={(value) => setFilters((current) => ({ ...current, customerId: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Customers</SelectItem>
              {customers.map((customer) => (
                <SelectItem key={customer._id} value={customer._id}>
                  {customer.name} {customer.type ? `(${customer.type})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ErpField>
        <ErpField label="Outlet">
          <Select value={filters.outletId} onValueChange={(value) => setFilters((current) => ({ ...current, outletId: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Outlets</SelectItem>
              {outlets.map((outlet) => (
                <SelectItem key={outlet._id} value={outlet._id}>
                  {outlet.name} {outlet.code ? `(${outlet.code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ErpField>
        <ErpField label="Status">
          <Select value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </ErpField>
        <ErpField label="Category">
          <Select value={filters.category} onValueChange={(value) => setFilters((current) => ({ ...current, category: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="DELIVER">Deliver</SelectItem>
              <SelectItem value="PICKUP">Pickup</SelectItem>
            </SelectContent>
          </Select>
        </ErpField>
        <ErpField label="Date Begin">
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
          />
        </ErpField>
        <ErpField label="Date End">
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
          />
        </ErpField>
        <div className="flex items-end gap-2">
          <Button onClick={() => void loadRecords()} disabled={isLoading} className="flex-1">
            <Search className="mr-2 h-4 w-4" />
            Filter
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setFilters({ search: "", customerId: "ALL", outletId: "ALL", status: "ALL", category: "ALL", dateFrom: todayString(), dateTo: todayString() });
              setTimeout(() => void loadRecords(), 0);
            }}
          >
            Reset
          </Button>
        </div>
      </ErpToolbar>

      <ErpSection title="Delivery queue" description="Pending items can be confirmed by main system or Flutter mobile app. Confirmed items are added to the selected outlet inventory.">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <ErpEmptyState title="No customer deliveries found" description="Create a delivery/pickup order or adjust the filters." />
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow>
                    <TableHead className="text-white">Code</TableHead>
                    <TableHead className="text-white">Customer</TableHead>
                    <TableHead className="text-white">Outlet</TableHead>
                    <TableHead className="text-white">Category</TableHead>
                    <TableHead className="text-white">Status</TableHead>
                    <TableHead className="text-white">Request</TableHead>
                    <TableHead className="text-right text-white">Items</TableHead>
                    <TableHead className="text-right text-white">Qty/Pcs</TableHead>
                    <TableHead className="text-right text-white">Amount</TableHead>
                    <TableHead className="text-center text-white">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record._id}>
                      <TableCell className="font-black">{record.deliveryCode}</TableCell>
                      <TableCell>
                        <div className="font-semibold">{record.customerName}</div>
                        <div className="text-xs text-slate-500">{record.customerAddress || record.customerPhone || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold">{record.outletName || "-"}</div>
                        <div className="text-xs text-slate-500">{record.outletCode || ""}</div>
                      </TableCell>
                      <TableCell>{categoryBadge(record.category)}</TableCell>
                      <TableCell>{statusBadge(record.status)}</TableCell>
                      <TableCell>{formatDate(record.requestDate)}</TableCell>
                      <TableCell className="text-right">{record.totalItems.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{record.totalQty.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-bold">{formatPeso(record.totalAmount)}</TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-2">
                          {record.status === "PENDING" ? (
                            <>
                              <Button size="sm" onClick={() => void confirmDelivery(record)} disabled={confirmingId === record._id}>
                                {confirmingId === record._id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                                Confirm
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => void cancelDelivery(record)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-500">No action</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 lg:hidden">
              {records.map((record) => (
                <ErpMobileCard key={record._id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black">{record.deliveryCode}</div>
                      <div className="text-sm text-slate-500">{record.customerName}</div>
                      <div className="text-xs text-slate-500">Outlet: {record.outletName || "-"}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {categoryBadge(record.category)}
                      {statusBadge(record.status)}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <ErpKeyValue label="Request" value={formatDate(record.requestDate)} />
                    <ErpKeyValue label="Amount" value={formatPeso(record.totalAmount)} />
                    <ErpKeyValue label="Items" value={record.totalItems.toLocaleString()} />
                    <ErpKeyValue label="Qty/Pcs" value={record.totalQty.toLocaleString()} />
                  </div>
                  {record.status === "PENDING" ? (
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => void confirmDelivery(record)} disabled={confirmingId === record._id}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void cancelDelivery(record)}>
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                </ErpMobileCard>
              ))}
            </div>
          </>
        )}
      </ErpSection>
    </ErpPage>
  );
}
