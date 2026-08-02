"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CustomerPicker, type CustomerOption } from "@/components/sales/CustomerPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatPeso } from "@/lib/utils";

type ProductType = "CHICKEN" | "BODEGA";

type UnifiedProduct = {
  key: string;
  id: string;
  type: ProductType;
  name: string;
  categoryName: string;
  saleUnit: "PACK" | "HEAD" | "QTY";
  availableQty: number;
  stockPcs: number;
  packSize: number;
  price: number;
};

type CartItem = UnifiedProduct & { quantity: number };

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
                    <div className="truncate text-xs text-muted-foreground">
                      {product.type === "CHICKEN" ? "Chicken" : "Grocery"} · {product.availableQty.toLocaleString()} {product.saleUnit.toLowerCase()} available · {formatPeso(product.price)}
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
  const [products, setProducts] = useState<UnifiedProduct[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptNumber, setReceiptNumber] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedProduct = products.find((product) => product.key === selectedKey);
  const grandTotal = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);

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
        categoryName: product.categoryName || "CHICKEN",
        saleUnit: product.saleUnit,
        availableQty: Number(product.availableQty || 0),
        stockPcs: Number(product.stockPcs || 0),
        packSize: Number(product.packSize || 0),
        price: Number(product.pricePerUnit || 0),
      })),
      ...grocery.map((product: any): UnifiedProduct => ({
        key: `BODEGA:${product._id}`,
        id: product._id,
        type: "BODEGA",
        name: product.name,
        categoryName: product.categoryName || "GROCERY",
        saleUnit: "QTY",
        availableQty: Number(product.stockPcs || 0),
        stockPcs: Number(product.stockPcs || 0),
        packSize: 0,
        price: Number(product.unitPrice || 0),
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
    const qty = Math.trunc(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("Quantity must be greater than zero.");
    const existingQty = cart.find((item) => item.key === selectedProduct.key)?.quantity || 0;
    if (existingQty + qty > selectedProduct.availableQty) return toast.error(`Only ${selectedProduct.availableQty} ${selectedProduct.saleUnit.toLowerCase()} available for ${selectedProduct.name}.`);
    setCart((current) => {
      const existing = current.find((item) => item.key === selectedProduct.key);
      return existing
        ? current.map((item) => item.key === selectedProduct.key ? { ...item, quantity: item.quantity + qty } : item)
        : [...current, { ...selectedProduct, quantity: qty }];
    });
    setSelectedKey("");
    setQuantity("0");
  }

  async function saveSale() {
    if (!customerId) return toast.error("Select a customer.");
    if (!saleDate) return toast.error("Sale date is required.");
    if (!receiptNumber.trim()) return toast.error("Receipt number is required.");
    if (cart.length === 0) return toast.error("Add at least one product.");

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const correctionReason = saleDate < today ? window.prompt("Reason for entering this sale late (required):")?.trim() : "";
    if (saleDate < today && (!correctionReason || correctionReason.length < 5)) return toast.error("Enter a late-entry reason of at least 5 characters.");

    setIsSaving(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "MIXED",
          customerId,
          saleDate,
          receiptNumber,
          correctionReason,
          items: cart.map((item) => ({
            source: item.type,
            productId: item.id,
            bodegaProductId: item.type === "CHICKEN" ? item.id : undefined,
            quantity: item.quantity,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Unable to save sale.");
      toast.success(json.message || "Sale saved successfully.");
      setReceiptNumber("");
      setCart([]);
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
      <Card><CardContent className="grid gap-4 p-5 lg:grid-cols-3">
        <div className="space-y-2"><Label>Customer *</Label><CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} /></div>
        <div className="space-y-2"><Label>Sale Date *</Label><Input type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)} /></div>
        <div className="space-y-2"><Label>Receipt Number *</Label><Input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} placeholder="e.g. 0003801" /></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Add Product</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
        <ProductPicker products={products} value={selectedKey} onChange={setSelectedKey} />
        <Input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Quantity" />
        <Button onClick={addItem}><Plus className="mr-2 h-4 w-4" />Add</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Sale Items</CardTitle></CardHeader><CardContent>
        {cart.length === 0 ? <div className="py-16 text-center text-muted-foreground"><ShoppingCart className="mx-auto mb-2 h-8 w-8" />No items yet.</div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Product</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Total</TableHead><TableHead /></TableRow></TableHeader><TableBody>{cart.map((item) => <TableRow key={item.key}><TableCell>{item.type === "CHICKEN" ? "Chicken" : "Grocery"}</TableCell><TableCell className="font-medium">{item.name}</TableCell><TableCell>{item.saleUnit}</TableCell><TableCell className="text-right">{item.quantity}</TableCell><TableCell className="text-right">{formatPeso(item.price)}</TableCell><TableCell className="text-right font-semibold">{formatPeso(item.quantity * item.price)}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setCart((current) => current.filter((row) => row.key !== item.key))}><Trash2 className="h-4 w-4 text-red-600" /></Button></TableCell></TableRow>)}</TableBody></Table></div>}
        <div className="mt-5 flex flex-col items-end gap-3 border-t pt-5"><div className="text-2xl font-bold">{formatPeso(grandTotal)}</div><Button size="lg" disabled={isSaving || cart.length === 0} onClick={saveSale}>{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save Sale</Button></div>
      </CardContent></Card>
    </div>
  );
}
