"use client";

import { EntryDialogContent } from "@/components/erp/EntryForm";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OutletOption = { _id: string; name: string; code: string };

type StockItem = {
  productSource: "BODEGA" | "GROCERY";
  productId: string;
  productName: string;
  stockQty: number;
};

type Component = {
  productSource: "BODEGA" | "GROCERY";
  productId: string;
  productName: string;
  qtyPerSale: number;
};

type MenuItem = {
  _id: string;
  name: string;
  category: string;
  price: number;
  sortOrder: number;
  isAvailable: boolean;
  components: Component[];
};

const emptyForm = {
  name: "",
  category: "Chicken",
  price: "",
  isAvailable: true,
  components: [] as Component[],
};

const CATEGORY_SUGGESTIONS = ["Chicken", "Drinks", "Rice", "Meals", "Others"];

export function OutletMenuPageClient() {
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [outletId, setOutletId] = useState("");
  const [items, setItems] = useState<MenuItem[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Load outlets once.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/outlets?limit=1000", { cache: "no-store" });
        const json = await res.json();
        if (res.ok && json.success) {
          setOutlets(json.data || []);
          if (json.data?.length && !outletId) setOutletId(json.data[0]._id);
        }
      } catch {
        toast.error("Failed to load outlets.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMenu = useCallback(async (oid: string) => {
    if (!oid) return;
    setLoading(true);
    try {
      const [menuRes, stockRes] = await Promise.all([
        fetch(`/api/outlet-menu?outletId=${oid}`, { cache: "no-store" }),
        fetch(`/api/outlet-inventory?outletId=${oid}&limit=1000`, {
          cache: "no-store",
        }),
      ]);
      const menuJson = await menuRes.json();
      const stockJson = await stockRes.json();

      if (menuRes.ok && menuJson.success) setItems(menuJson.data || []);
      if (stockRes.ok && stockJson.success) {
        setStock(
          (stockJson.data || []).map((s: any) => ({
            productSource: s.productSource,
            productId: s.productId,
            productName: s.productName,
            stockQty: Number(s.stockQty || 0),
          }))
        );
      }
    } catch {
      toast.error("Failed to load the outlet menu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (outletId) void loadMenu(outletId);
  }, [outletId, loadMenu]);

  const grouped = useMemo(() => {
    const map: Record<string, MenuItem[]> = {};
    for (const item of items) (map[item.category] ||= []).push(item);
    return Object.entries(map);
  }, [items]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(item: MenuItem) {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      price: String(item.price),
      isAvailable: item.isAvailable,
      components: item.components.map((c) => ({ ...c })),
    });
    setDialogOpen(true);
  }

  function addComponent() {
    if (stock.length === 0) {
      toast.error(
        "This outlet has no stock yet. Transfer stock to it first, then map ingredients."
      );
      return;
    }
    const first = stock[0];
    setForm((f) => ({
      ...f,
      components: [
        ...f.components,
        {
          productSource: first.productSource,
          productId: first.productId,
          productName: first.productName,
          qtyPerSale: 1,
        },
      ],
    }));
  }

  function updateComponent(index: number, key: string) {
    const picked = stock.find((s) => `${s.productSource}:${s.productId}` === key);
    if (!picked) return;
    setForm((f) => {
      const components = [...f.components];
      components[index] = {
        ...components[index],
        productSource: picked.productSource,
        productId: picked.productId,
        productName: picked.productName,
      };
      return { ...f, components };
    });
  }

  function updateComponentQty(index: number, qty: number) {
    setForm((f) => {
      const components = [...f.components];
      components[index] = { ...components[index], qtyPerSale: qty };
      return { ...f, components };
    });
  }

  function removeComponent(index: number) {
    setForm((f) => ({
      ...f,
      components: f.components.filter((_, i) => i !== index),
    }));
  }

  async function submit() {
    const price = Number(form.price);
    if (!form.name.trim()) {
      toast.error("Item name is required.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Enter a valid price.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        outletId,
        name: form.name.trim(),
        category: form.category.trim() || "Others",
        price,
        isAvailable: form.isAvailable,
        components: form.components.map((c) => ({
          productSource: c.productSource,
          productId: c.productId,
          productName: c.productName,
          qtyPerSale: Number(c.qtyPerSale) || 1,
        })),
      };

      const res = await fetch(
        editing ? `/api/outlet-menu/${editing._id}` : "/api/outlet-menu",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Save failed.");
      }

      toast.success(editing ? "Menu item updated." : "Menu item added.");
      setDialogOpen(false);
      void loadMenu(outletId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: MenuItem) {
    if (!confirm(`Remove "${item.name}" from the menu?`)) return;
    try {
      const res = await fetch(`/api/outlet-menu/${item._id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success("Menu item removed.");
      void loadMenu(outletId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Remove failed.");
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="size-6 text-rose-600" />
          <h1 className="text-2xl font-black">Outlet Menu</h1>
        </div>
        <p className="text-sm text-slate-500">
          The items each outlet sells on the cashier app. Set the name, price,
          and (optionally) which raw stock each item consumes when sold.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Outlet</Label>
          <Select value={outletId} onValueChange={setOutletId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select an outlet" />
            </SelectTrigger>
            <SelectContent>
              {outlets.map((o) => (
                <SelectItem key={o._id} value={o._id}>
                  {o.name}
                  {o.code ? ` (${o.code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={openCreate}
          disabled={!outletId}
          className="rounded-xl bg-rose-600 hover:bg-rose-700"
        >
          <Plus className="size-4" />
          Add Item
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
          No menu items yet for this outlet. Click &quot;Add Item&quot; to
          create the first one.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, catItems]) => (
            <div key={category}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                {category}
              </h2>
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                {catItems.map((item) => (
                  <div
                    key={item._id}
                    className="flex items-center gap-3 border-b border-slate-100 p-4 last:border-0"
                  >
                    <div className="flex-1">
                      <p className="font-bold text-slate-900">
                        {item.name}
                        {!item.isAvailable ? (
                          <span className="ml-2 text-xs font-medium text-amber-600">
                            (hidden)
                          </span>
                        ) : null}
                      </p>
                      {item.components.length > 0 ? (
                        <p className="text-xs text-slate-500">
                          Uses:{" "}
                          {item.components
                            .map(
                              (c) => `${c.qtyPerSale}× ${c.productName}`
                            )
                            .join(", ")}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400">
                          No stock deduction
                        </p>
                      )}
                    </div>
                    <p className="font-black text-rose-600">
                      ₱{item.price.toFixed(2)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(item)}
                    >
                      <Trash2 className="size-4 text-rose-600" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <EntryDialogContent className="max-h-[92vh] w-[95vw] max-w-[95vw] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Menu Item" : "Add Menu Item"}
            </DialogTitle>
            <DialogDescription>
              Set the retail item the cashier sells. Optionally map it to raw
              outlet stock so selling deducts inventory.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Item name</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g. Fried Chicken C10"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Price (₱)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category: c }))}
                    className={`rounded-full border px-3 py-1 text-sm ${
                      form.category === c
                        ? "border-rose-600 bg-rose-50 text-rose-700"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <Input
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                placeholder="Or type a custom category"
              />
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <Label>Stock it consumes (optional)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addComponent}
                >
                  <Plus className="size-4" />
                  Add ingredient
                </Button>
              </div>

              {form.components.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No stock mapping — this item just sells, without deducting
                  inventory. Add ingredients to deduct raw stock on each sale.
                </p>
              ) : (
                form.components.map((comp, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select
                      value={`${comp.productSource}:${comp.productId}`}
                      onValueChange={(v) => updateComponent(i, v)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Pick stock" />
                      </SelectTrigger>
                      <SelectContent>
                        {stock.map((s) => (
                          <SelectItem
                            key={`${s.productSource}:${s.productId}`}
                            value={`${s.productSource}:${s.productId}`}
                          >
                            {s.productName} ({s.stockQty} in stock)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-24"
                      value={comp.qtyPerSale}
                      onChange={(e) =>
                        updateComponentQty(i, Number(e.target.value))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeComponent(i)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))
              )}
              {form.components.length > 0 ? (
                <p className="text-xs text-slate-400">
                  The number is how many units of that stock are used per 1 item
                  sold.
                </p>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isAvailable: e.target.checked }))
                }
              />
              Available to sell (uncheck to hide from the cashier without
              deleting)
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={saving}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : editing ? (
                "Save Changes"
              ) : (
                "Add Item"
              )}
            </Button>
          </DialogFooter>
        </EntryDialogContent>
      </Dialog>
    </div>
  );
}
