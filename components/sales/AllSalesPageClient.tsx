"use client";

import { EntryActions } from "@/components/erp/EntryForm";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CustomerPicker, type CustomerOption } from "@/components/sales/CustomerPicker";
import { ItemDiscountSelector, SaleDiscountSummary, useItemDiscounts } from "@/components/sales/SaleDiscount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatPeso } from "@/lib/utils";
import { manilaDateString } from "@/lib/date-utils";
import { filterMainSaleProducts, mainSaleSource, type MainSaleProductFilter } from "@/lib/main-sales-entry";

type ProductType = "CHICKEN" | "BODEGA";

type UnifiedProduct = {
  key: string;
  id: string;
  type: ProductType;
  name: string;
  categoryName: string;
  saleUnit: string;
  availableQty: number;
  stockPcs: number;
  stockHeads?: number;
  stockKilos?: number;
  packSize: number;
  price: number;
  priceReviewRequired?: boolean;
};

type CartItem = UnifiedProduct & { quantity: number; kilosOut?: number; discountId?: string };

function ProductPicker({ products, value, onChange }: { products: UnifiedProduct[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = products.find((product) => product.key === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="h-10 w-full justify-between bg-white font-normal">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? selected.name : "Search all products..."}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[620px] max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search product or category..." />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
            <CommandGroup>
              {products.map((product) => (
                <CommandItem key={product.key} value={`${product.name} ${product.categoryName} ${product.type}`} onSelect={() => { onChange(product.key); setOpen(false); }} className="cursor-pointer">
                  <Check className={cn("mr-2 h-4 w-4", value === product.key ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{product.name}</div>
                    {product.priceReviewRequired && <div className="text-xs font-semibold text-amber-700">Selling price review required</div>}
                    <div className="truncate text-xs text-muted-foreground">
                      {product.type === "CHICKEN" ? "Bodega" : "Grocery"} · {product.availableQty.toLocaleString()} {product.saleUnit.toLowerCase()} available · {formatPeso(product.price)}
                    </div>
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

export function AllSalesPageClient() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [employees, setEmployees] = useState<Array<{ _id: string; code: string; name: string; customerId: string }>>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/employees", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || "Unable to load employees.");
      if (!controller.signal.aborted) setEmployees(json.employees);
    }).catch(error => { if (!controller.signal.aborted) toast.error(error.message); });
    return () => controller.abort();
  }, []);
  const [products, setProducts] = useState<UnifiedProduct[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [saleTo, setSaleTo] = useState<"CUSTOMER" | "EMPLOYEE">("CUSTOMER");
  const [saleDate, setSaleDate] = useState(() => manilaDateString());
  const [receiptNumber, setReceiptNumber] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [chickenKilos, setChickenKilos] = useState("");
  const [productFilter, setProductFilter] = useState<MainSaleProductFilter>("ALL");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedProduct = products.find((product) => product.key === selectedKey);
  const visibleProducts = filterMainSaleProducts(products, productFilter);
  const discount = useItemDiscounts(cart.map((item) => ({ subtotal: item.quantity * item.price, quantity: item.quantity, discountId: item.discountId })));

  async function loadCustomers() {
    const all: CustomerOption[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await fetch(`/api/customers?limit=100&page=${page}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load customers.");
      all.push(...(json.data || []));
      totalPages = Number(json.meta?.totalPages || 1);
      page += 1;
    } while (page <= totalPages);
    setCustomers(all);
  }

  async function loadProducts() {
    const [chickenRes, ...groceryResponses] = await Promise.all([
      fetch("/api/sales/chicken-products", { cache: "no-store" }),
      fetch("/api/products?limit=100&page=1", { cache: "no-store" }),
    ]);
    const chickenJson = await chickenRes.json();
    const groceryFirst = await groceryResponses[0].json();
    if (!chickenRes.ok || !chickenJson.success) throw new Error(chickenJson.message || "Failed to load chicken products.");
    if (!groceryResponses[0].ok || !groceryFirst.success) throw new Error(groceryFirst.message || "Failed to load grocery products.");

    const grocery = [...(groceryFirst.data || [])];
    const totalPages = Number(groceryFirst.meta?.totalPages || 1);
    for (let page = 2; page <= totalPages; page += 1) {
      const res = await fetch(`/api/products?limit=100&page=${page}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load grocery products.");
      grocery.push(...(json.data || []));
    }

    setProducts([
      ...(chickenJson.data || []).map((product: any): UnifiedProduct => ({
        key: `CHICKEN:${product.bodegaProductId}`,
        id: product.bodegaProductId,
        type: "CHICKEN",
        name: product.name,
        categoryName: product.categoryName || "Uncategorized",
        saleUnit: product.saleUnit === "QTY" ? "PCS" : product.saleUnit,
        availableQty: Number(product.availableQty || 0),
        stockPcs: Number(product.stockPcs || 0),
        stockHeads: Number(product.stockHeads || 0),
        stockKilos: Number(product.stockKilos || 0),
        packSize: Number(product.packSize || 0),
        price: Number(product.pricePerUnit || 0),
      })),
      ...grocery.map((product: any): UnifiedProduct => ({
        key: `BODEGA:${product._id}`,
        id: product._id,
        type: "BODEGA",
        name: product.name,
        categoryName: product.categoryName || "Uncategorized",
        saleUnit: product.unitCode || "PCS",
        availableQty: Number(product.stockPcs || 0),
        stockPcs: Number(product.stockPcs || 0),
        packSize: 0,
        price: Number(product.unitPrice || 0),
        priceReviewRequired: !!product.priceReviewRequired,
      })),
    ].sort((a, b) => a.name.localeCompare(b.name)));
  }

  useEffect(() => {
    Promise.all([loadCustomers(), loadProducts()])
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load sales data."))
      .finally(() => setIsLoading(false));
  }, []);

  function addItem() {
    if (!selectedProduct) return toast.error("Select a product.");
    if (selectedProduct.priceReviewRequired) return toast.error("A manager must approve this product's selling price in Grocery Products > Review Price. Reload this page after approval.");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0 || (selectedProduct.saleUnit !== "KG" && !Number.isSafeInteger(qty))) return toast.error("Enter a positive quantity; heads, pieces and packs require whole numbers.");
    const kilosOut = selectedProduct.saleUnit === "HEAD" && chickenKilos.trim() !== "" ? Number(chickenKilos) : undefined;
    if (kilosOut !== undefined && (!Number.isFinite(kilosOut) || kilosOut <= 0)) return toast.error("Enter a positive actual weight or leave kilos blank to estimate.");
    const existingItem = cart.find(item => item.key === selectedProduct.key);
    if (selectedProduct.saleUnit === "HEAD" && existingItem && (existingItem.kilosOut !== undefined) !== (kilosOut !== undefined)) return toast.error("Use the same weight method for this product. Remove its existing row before switching between actual and estimated weight.");
    const existingQty = cart.find((item) => item.key === selectedProduct.key)?.quantity || 0;
    if (existingQty + qty > selectedProduct.availableQty) return toast.error(`Only ${selectedProduct.availableQty} ${selectedProduct.saleUnit.toLowerCase()} available for ${selectedProduct.name}.`);
    setCart((current) => {
      const existing = current.find((item) => item.key === selectedProduct.key);
      return existing
        ? current.map((item) => item.key === selectedProduct.key ? { ...item, quantity: item.quantity + qty, ...(kilosOut != null ? { kilosOut: Number(item.kilosOut || 0) + kilosOut } : {}) } : item)
        : [...current, { ...selectedProduct, quantity: qty, kilosOut }];
    });
    setSelectedKey("");
    setQuantity("1");
    setChickenKilos("");
  }

  async function saveSale() {
    if (discount.error) { toast.error(discount.error); return; }
    if (!customerId) return toast.error(saleTo === "EMPLOYEE" ? "Select an employee." : "Select a customer.");
    const employee = employees.find(item => item.customerId === customerId);
    if (saleTo === "EMPLOYEE" && !employee) return toast.error("Select a valid employee account.");
    if (saleTo === "CUSTOMER" && employee) return toast.error("Use Employee Credit for this account.");
    if (!saleDate) return toast.error("Sale date is required.");
    if (!receiptNumber.trim()) return toast.error("Receipt number is required.");
    if (cart.length === 0) return toast.error("Add at least one product.");
    if (saleTo === "EMPLOYEE" && !window.confirm(`Charge ${formatPeso(discount.preview.totalAmount)} to ${employee!.name} (${employee!.code}) as employee credit?`)) return;

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const correctionReason = saleDate < today ? window.prompt("Reason for entering this sale late (required):")?.trim() : "";
    if (saleDate < today && (!correctionReason || correctionReason.length < 5)) return toast.error("Enter a late-entry reason of at least 5 characters.");

    setIsSaving(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: mainSaleSource(cart),
          customerId,
          saleTo,
          saleDate,
          receiptNumber,
          correctionReason,
          items: cart.map((item) => ({
            source: item.type,
            productId: item.id,
            bodegaProductId: item.type === "CHICKEN" ? item.id : undefined,
            quantity: item.quantity,
            kilosOut: item.kilosOut,
            discountId: item.discountId || undefined,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Unable to save sale.");
      toast.success(json.message || "Sale saved successfully.");
      setReceiptNumber("");
      setCart([]);
      if (saleTo === "EMPLOYEE") { setCustomerId(""); setSaleTo("CUSTOMER"); }
      await loadProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save sale.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <Card><CardContent className="grid items-end gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[180px_minmax(0,1fr)_minmax(180px,0.65fr)_minmax(180px,0.65fr)]">
          <div className="space-y-2"><Label htmlFor="sale-recipient-type">Sale To</Label><select id="sale-recipient-type" className="h-10 w-full rounded-md border bg-white px-3" disabled={isSaving} value={saleTo} onChange={event => { setSaleTo(event.target.value as "CUSTOMER" | "EMPLOYEE"); setCustomerId(""); }}><option value="CUSTOMER">Customer</option><option value="EMPLOYEE">Employee Credit</option></select></div>
          {saleTo === "CUSTOMER" ? <div className="space-y-2"><Label>Customer *</Label><CustomerPicker customers={customers.filter(customer => !employees.some(employee => employee.customerId === customer._id))} value={customerId} onChange={setCustomerId} /></div> : <div className="space-y-2"><Label htmlFor="sale-employee">Employee *</Label><select id="sale-employee" className="h-10 w-full rounded-md border bg-white px-3" disabled={isSaving} value={customerId} onChange={event => setCustomerId(event.target.value)}><option value="">Select employee</option>{employees.map(employee => <option key={employee._id} value={employee.customerId}>{employee.code} — {employee.name}</option>)}</select></div>}
        <div className="space-y-2"><Label>Sale Date *</Label><Input type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)} /></div>
        <div className="space-y-2"><Label>Receipt Number *</Label><Input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} placeholder="e.g. 0003801" /></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Add Product</CardTitle></CardHeader><CardContent className={cn("grid items-end gap-3", selectedProduct?.saleUnit === "HEAD" ? "lg:grid-cols-[auto_minmax(0,1fr)_120px_200px_auto]" : "lg:grid-cols-[auto_minmax(0,1fr)_140px_auto]")}>
        <div className="flex gap-2" role="group" aria-label="Product type filter">{([{ value: "ALL", label: "All" }, { value: "CHICKEN", label: "Chicken" }, { value: "BODEGA", label: "Grocery" }] as const).map(filter => <Button key={filter.value} className="h-10" type="button" variant={productFilter === filter.value ? "default" : "outline"} aria-pressed={productFilter === filter.value} onClick={() => { setProductFilter(filter.value); setSelectedKey(""); setQuantity("1"); setChickenKilos(""); }}>{filter.label}</Button>)}</div>
        <div className="min-w-0 space-y-2"><Label>Product</Label><ProductPicker products={visibleProducts} value={selectedKey} onChange={value => { setSelectedKey(value); setQuantity("1"); setChickenKilos(""); }} /></div>
        <div className="space-y-2"><Label htmlFor="sale-item-quantity">Quantity{selectedProduct ? ` (${selectedProduct.saleUnit.toLowerCase()})` : ""}</Label><Input id="sale-item-quantity" className="h-10" type="number" min="0" step={selectedProduct?.saleUnit === "KG" ? "any" : "1"} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Quantity" /></div>
        {selectedProduct?.saleUnit === "HEAD" && <div className="space-y-2"><Label htmlFor="sale-item-kilos">Actual Kilos (optional)</Label><Input id="sale-item-kilos" className="h-10" type="number" min="0" step="any" placeholder="Leave blank to estimate" value={chickenKilos} onChange={event => setChickenKilos(event.target.value)} /></div>}
        <Button className="h-10 lg:min-w-24" onClick={addItem}><Plus className="mr-2 h-4 w-4" />Add</Button>
        {selectedProduct?.saleUnit === "HEAD" && <p className="text-xs text-slate-500 lg:col-span-5">{!chickenKilos && Number(selectedProduct.stockHeads) > 0 ? `Estimated: ${(Number(selectedProduct.stockKilos) / Number(selectedProduct.stockHeads) * Number(quantity || 0)).toFixed(3)} kg. Price remains per head.` : "Leave kilos blank to estimate from inventory. Price remains per head."}</p>}

      </CardContent></Card>
      <Card><CardHeader><CardTitle>Sale Items</CardTitle></CardHeader><CardContent>
        {cart.filter(item => item.saleUnit === "HEAD" && item.kilosOut === undefined).map(item => <p key={`weight:${item.key}`} className="mb-2 text-xs text-slate-500">{item.name}: estimated weight based on available inventory will be calculated when saved. Selling price is per head.</p>)}
        {cart.length === 0 ? <div className="py-16 text-center text-muted-foreground"><ShoppingCart className="mx-auto mb-2 h-8 w-8" />No items yet.</div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Product</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Price</TableHead><TableHead>Discount</TableHead><TableHead className="text-right">Total</TableHead><TableHead /></TableRow></TableHeader><TableBody>{cart.map((item) => <TableRow key={item.key}><TableCell>{item.type === "CHICKEN" ? "Bodega" : "Grocery"}</TableCell><TableCell className="font-medium">{item.name}</TableCell><TableCell>{item.categoryName}</TableCell><TableCell>{item.saleUnit}</TableCell><TableCell className="text-right">{item.quantity}{item.kilosOut != null && <span className="block text-xs text-slate-500">{item.kilosOut} kg</span>}</TableCell><TableCell className="text-right">{formatPeso(item.price)}</TableCell><TableCell><ItemDiscountSelector options={discount.options} value={item.discountId} disabled={isSaving} label={`Discount for ${item.name}`} onChange={(discountId) => setCart((current) => current.map((row) => row.key === item.key ? { ...row, discountId } : row))} /></TableCell><TableCell className="text-right font-semibold">{formatPeso(discount.lineTotal(item.quantity * item.price, item.quantity, item.discountId))}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setCart((current) => current.filter((row) => row.key !== item.key))}><Trash2 className="h-4 w-4 text-red-600" /></Button></TableCell></TableRow>)}</TableBody></Table></div>}
        <EntryActions className="mt-5"><SaleDiscountSummary discount={discount} /><Button size="lg" disabled={isSaving || cart.length === 0 || Boolean(discount.error)} onClick={saveSale}>{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save Sale</Button></EntryActions>
      </CardContent></Card>
    </div>
  );
}
