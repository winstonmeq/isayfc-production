"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CustomerPicker, type CustomerOption } from "@/components/sales/CustomerPicker";
import { ItemDiscountSelector, SaleDiscountSummary, useItemDiscounts } from "@/components/sales/SaleDiscount";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatPeso } from "@/lib/utils";

type ProductOption = {
  _id: string;
  name: string;
  categoryId?:
    | string
    | {
        _id: string;
        name: string;
      };
  categoryName?: string;
  buyingPrice?: number;
  unitPrice?: number;
  stockPcs?: number;
  stockBags?: number;
  stockKilos?: number;
};

type SaleRow = {
  discountId?: string;
  productId: string;
  price: string;
  quantity: string;
};

const emptyRow: SaleRow = {
  productId: "",
  price: "0",
  quantity: "0",
};

function getProductStock(product?: ProductOption) {
  if (!product) return 0;
  return Number(product.stockPcs || 0);
}

function getProductPrice(product?: ProductOption) {
  if (!product) return 0;
  return Number(product.unitPrice || 0);
}

function getCategoryName(product?: ProductOption) {
  if (!product) return "NO CATEGORY";

  if (product.categoryName) return product.categoryName;

  if (
    product.categoryId &&
    typeof product.categoryId === "object" &&
    product.categoryId.name
  ) {
    return product.categoryId.name;
  }

  return "NO CATEGORY";
}

function GroceryProductPicker({
  products,
  value,
  onChange,
}: {
  products: ProductOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find((product) => product._id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="h-10 w-full justify-between bg-white font-normal">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : "Search grocery product..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[560px] max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search product name..." />
          <CommandList>
            <CommandEmpty>No grocery product found.</CommandEmpty>
            <CommandGroup>
              {products.map((product) => (
                <CommandItem
                  key={product._id}
                  value={`${product.name} ${getCategoryName(product)}`}
                  onSelect={() => {
                    onChange(product._id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check className={cn("mr-2 h-4 w-4", value === product._id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">
                    {product.name} — Stock: {getProductStock(product)} — {formatPeso(getProductPrice(product))}
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

export function SaleGroceryPageClient() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [saleDate, setSaleDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [customerId, setCustomerId] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");

  const [rows, setRows] = useState<SaleRow[]>([
    { ...emptyRow },
    { ...emptyRow },
    { ...emptyRow },
  ]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const discount = useItemDiscounts(rows.filter((row) => row.productId && Number(row.quantity) > 0).map((row) => ({ subtotal: (Number(row.price) || 0) * (Number(row.quantity) || 0), quantity: Number(row.quantity), discountId: row.discountId })));

  async function loadCustomers() {
    const allCustomers: CustomerOption[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const res = await fetch(`/api/customers?limit=100&page=${page}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load customers.");
      allCustomers.push(...(json.data || []));
      totalPages = Number(json.meta?.totalPages || 1);
      page += 1;
    } while (page <= totalPages);

    setCustomers(allCustomers);
  }

  async function loadProducts() {
    const allProducts: ProductOption[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const res = await fetch(`/api/products?limit=100&page=${page}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load products.");
      allProducts.push(...(json.data || []));
      totalPages = Number(json.meta?.totalPages || 1);
      page += 1;
    } while (page <= totalPages);

    setProducts(allProducts);
  }

  async function loadInitialData() {
    setIsLoading(true);

    try {
      await Promise.all([loadCustomers(), loadProducts()]);
    } catch {
      toast.error("Failed to load grocery sale data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadInitialData();
    // Initial page load only; later refreshes happen after a sale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateRow(index: number, field: keyof SaleRow, value: string) {
    setRows((current) => {
      const next = [...current];

      next[index] = {
        ...next[index],
        [field]: value,
      };

      if (field === "productId") {
        next[index].discountId = "";
        const product = products.find((item) => item._id === value);

        if (product) {
          next[index].price = String(getProductPrice(product));
        }
      }

      return next;
    });
  }

  function addRow() {
    setRows((current) => [...current, { ...emptyRow }]);
  }

  function removeRow(index: number) {
    setRows((current) => {
      if (current.length === 1) return current;
      return current.filter((_, rowIndex) => rowIndex !== index);
    });
  }

  async function saveSale() {
    if (discount.error) { toast.error(discount.error); return; }
    if (!saleDate) {
      toast.error("Date of sale is required.");
      return;
    }

    if (!customerId) {
      toast.error("Please select customer.");
      return;
    }

    if (!receiptNumber.trim()) {
      toast.error("Receipt number is required.");
      return;
    }

    const validRows = rows
      .filter((row) => row.productId && Number(row.quantity) > 0)
      .map((row) => {
        const product = products.find((item) => item._id === row.productId);

        return {
          productId: row.productId,
          discountId: row.discountId || undefined,
          quantity: Number(row.quantity) || 0,
          qty: Number(row.quantity) || 0,
          price: Number(row.price) || 0,
          unitPrice: Number(row.price) || 0,
          productName: product?.name || "",
          categoryName: getCategoryName(product),
        };
      });

    if (validRows.length === 0) {
      toast.error("Add at least one product.");
      return;
    }

    for (const row of validRows) {
      const product = products.find((item) => item._id === row.productId);

      if (!product) {
        toast.error("Selected product was not found.");
        return;
      }

      const availableStock = getProductStock(product);

      if (row.quantity > availableStock) {
        toast.error(
          `Not enough stock for ${product.name}. Available: ${availableStock}.`
        );
        return;
      }

      if (row.price <= 0) {
        toast.error(`Price must be greater than zero for ${product.name}.`);
        return;
      }
    }

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const correctionReason =
      saleDate < today
        ? window.prompt("Reason for entering this sale late (required):")?.trim()
        : "";

    if (saleDate < today && (!correctionReason || correctionReason.length < 5)) {
      toast.error("Enter a late-entry reason of at least 5 characters.");
      return;
    }

    setIsSaving(true);

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "BODEGA",
          customerId,
          saleDate,
          receiptNumber,
          correctionReason,
          items: validRows,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save sale.");
      }

      toast.success(json.message || "Sale saved successfully.");

      setCustomerId("");
      setReceiptNumber("");
      setRows([{ ...emptyRow }, { ...emptyRow }, { ...emptyRow }]);

      await loadProducts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save sale."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-5 p-5">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label>Date of Sale</Label>
                  <Input
                    type="date"
                    value={saleDate}
                    onChange={(event) => setSaleDate(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Customer</Label>
                  <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} />
                </div>

                <div className="space-y-2">
                  <Label>Receipt Number</Label>
                  <Input
                    value={receiptNumber}
                    onChange={(event) => setReceiptNumber(event.target.value)}
                    placeholder="e.g. 0002318"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {rows.map((row, index) => {
                  const selectedProduct = products.find(
                    (product) => product._id === row.productId
                  );

                  const availableStock = getProductStock(selectedProduct);
                  const unitPrice = getProductPrice(selectedProduct);
                  const lineTotal =
                    (Number(row.price) || 0) * (Number(row.quantity) || 0);

                  return (
                    <div
                      key={index}
                      className="rounded-2xl border bg-slate-50 p-4"
                    >
                      <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1.5fr_1fr_auto]">
                        <div className="space-y-2">
                          <Label>Product</Label>
                          <GroceryProductPicker
                            products={products}
                            value={row.productId}
                            onChange={(value) => updateRow(index, "productId", value)}
                          />

                          {selectedProduct ? (
                            <p className="text-xs text-muted-foreground">
                              Category: {getCategoryName(selectedProduct)} |
                              Stock: {availableStock} | Unit Price:{" "}
                              {formatPeso(unitPrice)}
                            </p>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <Label>Price</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.price}
                            onChange={(event) =>
                              updateRow(index, "price", event.target.value)
                            }
                            className="bg-white"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Quantity</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.quantity}
                            onChange={(event) =>
                              updateRow(index, "quantity", event.target.value)
                            }
                            className="bg-white"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Discount</Label>
                          <ItemDiscountSelector options={discount.options} value={row.discountId} disabled={isSaving || !row.productId} label={`Discount for ${selectedProduct?.name || `row ${index + 1}`}`} onChange={(discountId) => updateRow(index, "discountId", discountId)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Line Total</Label>
                          <Input
                            value={discount.lineTotal(lineTotal, Number(row.quantity), row.discountId).toFixed(2)}
                            disabled
                            className="bg-white"
                          />
                        </div>

                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => removeRow(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button type="button" variant="secondary" onClick={addRow}>
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>

              <div className="flex flex-col items-end gap-3 rounded-2xl bg-slate-950 p-5 text-white">
                <p className="text-sm text-white/70">Grand Total</p>
                <p className="text-3xl font-black">{formatPeso(discount.preview.totalAmount)}</p>
              </div>

              <SaleDiscountSummary discount={discount} />
              <div className="flex justify-end">
                <Button
                  onClick={saveSale}
                  disabled={isSaving || Boolean(discount.error)}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Save Sale
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
