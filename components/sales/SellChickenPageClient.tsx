"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronsUpDown, Loader2, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  ErpEmptyState,
  ErpField,
  ErpKeyValue,
  ErpMobileCard,
  ErpPage,
  ErpSection,
} from "@/components/erp/ErpShell";
import { formatWholeNumber, numberValue, PackStockDisplay, wholeNumber } from "@/components/erp/StockDisplay";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type CustomerOption = {
  _id: string;
  name: string;
  outletName?: string;
};

type ChickenProductOption = {
  _id: string;
  productId: string;
  bodegaProductId: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  pricePerPcs: number;
  pricePerUnit: number;
  saleUnit: "PACK" | "HEAD";
  packSize: number;
  stockPcs: number;
  stockHeads: number;
  availableQty: number;
  loosePcs: number;
};

type CartItem = {
  productId: string;
  bodegaProductId: string;
  name: string;
  categoryName?: string;
  availableQty: number;
  loosePcs: number;
  quantity: number;
  saleUnit: "PACK" | "HEAD";
  pricePerUnit: number;
  pricePerPcs: number;
  packSize: number;
  stockPcsOut: number;
};

function CustomerPicker({
  customers,
  value,
  onChange,
}: {
  customers: CustomerOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = customers.find((customer) => customer._id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between bg-white font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected
              ? `${selected.name}${selected.outletName ? ` — Outlet: ${selected.outletName}` : ""}`
              : "Search customer..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search customer name..." />
          <CommandList>
            <CommandEmpty>No customer found.</CommandEmpty>
            <CommandGroup>
              {customers.map((customer) => (
                <CommandItem
                  key={customer._id}
                  value={`${customer.name} ${customer.outletName || ""}`}
                  onSelect={() => {
                    onChange(customer._id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check className={cn("mr-2 h-4 w-4", value === customer._id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">
                    {customer.name}
                    {customer.outletName ? ` — Outlet: ${customer.outletName}` : ""}
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

export function SellChickenPageClient() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<ChickenProductOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptNumber, setReceiptNumber] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [packs, setPacks] = useState("0");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedProduct = products.find((product) => product.productId === selectedProductId || product.bodegaProductId === selectedProductId);

  const totals = useMemo(() => {
    return cart.reduce(
      (sum, item) => ({
        packs: sum.packs + (item.saleUnit === "PACK" ? item.quantity : 0),
        heads: sum.heads + (item.saleUnit === "HEAD" ? item.quantity : 0),
        pcsOut: sum.pcsOut + item.stockPcsOut,
        grandTotal: sum.grandTotal + item.quantity * item.pricePerUnit,
      }),
      { packs: 0, heads: 0, pcsOut: 0, grandTotal: 0 }
    );
  }, [cart]);

  async function loadCustomers() {
    const allCustomers: CustomerOption[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const res = await fetch(`/api/customers?limit=100&page=${page}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load customers.");
      }
      allCustomers.push(...(json.data || []));
      totalPages = Number(json.meta?.totalPages || 1);
      page += 1;
    } while (page <= totalPages);

    setCustomers(allCustomers);
  }

  async function loadProducts() {
    const res = await fetch("/api/sales/chicken-products", { cache: "no-store" });
    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to load chicken products.");
    }

    setProducts(json.data || []);
  }

  async function loadInitialData() {
    setIsLoading(true);
    try {
      await Promise.all([loadCustomers(), loadProducts()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load sales data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadInitialData();
    // Initial page load only; later refreshes are performed after a sale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addToCart() {
    if (!selectedProduct) {
      toast.error("Please select a product.");
      return;
    }

    const quantityToSell = wholeNumber(packs);
    if (quantityToSell <= 0) {
      toast.error("Quantity must be greater than zero.");
      return;
    }

    if (selectedProduct.saleUnit === "PACK" && numberValue(selectedProduct.packSize) <= 0) {
      toast.error("Pack size is not configured for this product.");
      return;
    }

    if (numberValue(selectedProduct.pricePerUnit) <= 0) {
      toast.error(`Price per ${selectedProduct.saleUnit.toLowerCase()} is not configured for this product.`);
      return;
    }

    const existing = cart.find((item) => item.bodegaProductId === selectedProduct.bodegaProductId);
    const currentQuantity = existing?.quantity || 0;
    const newTotalQuantity = currentQuantity + quantityToSell;

    if (newTotalQuantity > selectedProduct.availableQty) {
      toast.error(`Not enough stock. Available: ${selectedProduct.availableQty} ${selectedProduct.saleUnit.toLowerCase()}(s).`);
      return;
    }

    if (existing) {
      setCart((current) =>
        current.map((item) =>
          item.bodegaProductId === selectedProduct.bodegaProductId
            ? {
                ...item,
                quantity: newTotalQuantity,
                stockPcsOut: newTotalQuantity * (item.saleUnit === "PACK" ? item.packSize : 1),
              }
            : item
        )
      );
    } else {
      setCart((current) => [
        ...current,
        {
          productId: selectedProduct.productId,
          bodegaProductId: selectedProduct.bodegaProductId,
          name: selectedProduct.name,
          categoryName: selectedProduct.categoryName,
          availableQty: selectedProduct.availableQty,
          loosePcs: selectedProduct.loosePcs,
          quantity: quantityToSell,
          saleUnit: selectedProduct.saleUnit,
          pricePerUnit: selectedProduct.pricePerUnit,
          pricePerPcs: selectedProduct.pricePerPcs,
          packSize: selectedProduct.packSize,
          stockPcsOut: quantityToSell * (selectedProduct.saleUnit === "PACK" ? selectedProduct.packSize : 1),
        },
      ]);
    }

    setSelectedProductId("");
    setPacks("0");
  }

  function removeCartItem(bodegaProductId: string) {
    setCart((current) => current.filter((item) => item.bodegaProductId !== bodegaProductId));
  }

  async function submitSale() {
    if (!customerId) {
      toast.error("Please select a customer.");
      return;
    }

    if (!receiptNumber.trim()) {
      toast.error("Receipt number is required.");
      return;
    }

    if (cart.length === 0) {
      toast.error("Add at least one product.");
      return;
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "CHICKEN",
          customerId,
          saleDate,
          receiptNumber,
          correctionReason,
          items: cart.map((item) => ({
            productId: item.bodegaProductId,
            bodegaProductId: item.bodegaProductId,
            quantity: item.quantity,
            saleUnit: item.saleUnit,
          })),
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to submit sale.");
      }

      toast.success(json.message || "Sale created successfully.");
      setCustomerId("");
      setReceiptNumber("");
      setSelectedProductId("");
      setPacks("0");
      setCart([]);
      await loadProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit sale.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ErpPage>
      {isLoading ? (
        <ErpSection>
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
          </div>
        </ErpSection>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
          <div className="space-y-5">
            <ErpSection title="Sale Details" description="Choose customer, receipt, product, and quantity.">
              <div className="grid gap-4 md:grid-cols-3">
                <ErpField label="Customer *">
                  <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} />
                </ErpField>
                <ErpField label="Sale Date *">
                  <Input type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)} />
                </ErpField>
                <ErpField label="Receipt Number *">
                  <Input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} placeholder="e.g. 0002318" />
                </ErpField>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr_auto]">
                <ErpField label="Product">
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select chicken product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.bodegaProductId} value={product.bodegaProductId}>
                          {product.name} - {formatWholeNumber(product.availableQty)} {product.saleUnit.toLowerCase()}(s)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ErpField>
                <ErpField label={selectedProduct ? `${selectedProduct.saleUnit === "PACK" ? "Packs" : "Heads"} to Sell` : "Quantity to Sell"}>
                  <Input type="number" min="0" step="1" value={packs} onChange={(event) => setPacks(event.target.value)} />
                </ErpField>
                <div className="flex items-end">
                  <Button type="button" className="h-10 w-full lg:w-auto" onClick={addToCart}>
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>

              {selectedProduct ? (
                <div className="mt-5 grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Available Stock</p>
                    {selectedProduct.saleUnit === "PACK" ? (
                      <PackStockDisplay stockPcs={selectedProduct.stockPcs} packSize={selectedProduct.packSize} />
                    ) : (
                      <p className="text-lg font-black text-slate-950">{formatWholeNumber(selectedProduct.availableQty)} heads</p>
                    )}
                  </div>
                  <ErpKeyValue label={`Price / ${selectedProduct.saleUnit === "PACK" ? "Pack" : "Head"}`} value={formatPeso(selectedProduct.pricePerUnit)} />
                  {selectedProduct.saleUnit === "PACK" ? (
                    <ErpKeyValue label="Price / PCS" value={formatPeso(selectedProduct.pricePerPcs)} />
                  ) : null}
                </div>
              ) : null}
            </ErpSection>

            <ErpSection title="Cart Items" description="Review quantities and inventory deduction before submitting.">
              {cart.length === 0 ? (
                <ErpEmptyState title="No items yet" description="Select a product and add packs to sell." />
              ) : (
                <>
                  <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
                    <Table>
                      <TableHeader className="bg-slate-950">
                        <TableRow>
                          <TableHead className="text-white">#</TableHead>
                          <TableHead className="text-white">Product</TableHead>
                          <TableHead className="text-white">Category</TableHead>
                          <TableHead className="text-white">Available</TableHead>
                          <TableHead className="text-right text-white">Unit</TableHead>
                          <TableHead className="text-right text-white">Quantity</TableHead>
                          <TableHead className="text-right text-white">PCS Out</TableHead>
                          <TableHead className="text-right text-white">Unit Price</TableHead>
                          <TableHead className="text-right text-white">Line Total</TableHead>
                          <TableHead className="text-center text-white">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cart.map((item, index) => (
                          <TableRow key={item.bodegaProductId}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell className="font-bold text-slate-950">{item.name}</TableCell>
                            <TableCell>{item.categoryName || "-"}</TableCell>
                            <TableCell>
                              {formatWholeNumber(item.availableQty)} {item.saleUnit.toLowerCase()}(s)
                            </TableCell>
                            <TableCell className="text-right">{item.saleUnit}</TableCell>
                            <TableCell className="text-right font-bold">{formatWholeNumber(item.quantity)}</TableCell>
                            <TableCell className="text-right">{formatWholeNumber(item.stockPcsOut)} pcs</TableCell>
                            <TableCell className="text-right">{formatPeso(item.pricePerUnit)}</TableCell>
                            <TableCell className="text-right font-bold">{formatPeso(item.quantity * item.pricePerUnit)}</TableCell>
                            <TableCell className="text-center">
                              <Button size="icon" variant="destructive" onClick={() => removeCartItem(item.bodegaProductId)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {cart.map((item) => (
                      <ErpMobileCard key={item.bodegaProductId}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-black text-slate-950">{item.name}</h3>
                            <p className="text-sm text-slate-500">{item.categoryName || "-"}</p>
                          </div>
                          <Button size="icon" variant="destructive" onClick={() => removeCartItem(item.bodegaProductId)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <ErpKeyValue label={item.saleUnit === "PACK" ? "Packs" : "Heads"} value={formatWholeNumber(item.quantity)} />
                          <ErpKeyValue label="PCS Out" value={`${formatWholeNumber(item.stockPcsOut)} pcs`} />
                          <ErpKeyValue label="Unit Price" value={formatPeso(item.pricePerUnit)} />
                          <ErpKeyValue label="Line Total" value={formatPeso(item.quantity * item.pricePerUnit)} />
                        </div>
                      </ErpMobileCard>
                    ))}
                  </div>
                </>
              )}
            </ErpSection>
          </div>

          <Card className="h-fit rounded-3xl border-slate-200 shadow-sm xl:sticky xl:top-24">
            <CardHeader>
              <CardTitle className="text-base font-black">Checkout Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-3xl bg-slate-950 p-5 text-white">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-300">Grand Total</p>
                <p className="mt-2 text-3xl font-black">{formatPeso(totals.grandTotal)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ErpKeyValue label="Total Packs" value={formatWholeNumber(totals.packs)} />
                <ErpKeyValue label="Total Heads" value={formatWholeNumber(totals.heads)} />
                <ErpKeyValue label="PCS Out" value={`${formatWholeNumber(totals.pcsOut)} pcs`} />
              </div>
              <Button type="button" onClick={submitSale} disabled={isSaving || cart.length === 0} className="h-12 w-full rounded-2xl">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Submit Sale
              </Button>
              <p className="text-xs leading-5 text-slate-500">
                Sliced products sell by pack. Whole-chicken products sell by head. Every sale is recorded as an inventory stock-out.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </ErpPage>
  );
}
