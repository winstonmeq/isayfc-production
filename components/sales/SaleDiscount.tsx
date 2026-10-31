"use client";

import { useEffect, useState } from "react";
import { applyItemDiscounts, type DiscountRule } from "@/lib/discounts";
import { formatPeso } from "@/lib/utils";

export type DiscountOption = DiscountRule & { _id: string };

export function useItemDiscounts(items: { subtotal: number; quantity: number; discountId?: string }[]) {
  const [options, setOptions] = useState<DiscountOption[]>([]);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/discounts", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load discounts.");
        setOptions(payload.data || []);
      })
      .catch((error: Error) => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, []);
  function lineTotal(subtotal: number, quantity: number, discountId?: string) {
    try { return applyItemDiscounts([{ subtotal, quantity, discount: options.find((item) => item._id === discountId) }]).totalAmount; }
    catch { return subtotal; }
  }
  let preview = { subtotal: 0, discountAmount: 0, totalAmount: 0 };
  let error = "";
  try {
    preview = applyItemDiscounts(items.map((item) => {
      const rule = options.find((option) => option._id === item.discountId);
      if (item.discountId && !rule) throw new Error("A selected product discount is unavailable.");
      return { subtotal: item.subtotal, quantity: item.quantity, discount: rule };
    }));
  } catch (failure) { error = (failure as Error).message; }
  return { options, loadError, preview, error, lineTotal };
}

export function ItemDiscountSelector({ options, value, onChange, disabled, label = "Product discount" }: {
  options: DiscountOption[]; value?: string; onChange: (value: string) => void; disabled?: boolean; label?: string;
}) {
  return <select aria-label={label} className="h-10 w-full min-w-40 rounded-md border bg-white px-2 text-sm text-slate-900" value={value || ""} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
    <option value="">No discount</option>
    {options.map((item) => <option key={item._id} value={item._id}>{item.name} — {item.type === "PERCENTAGE" ? `${item.value}%` : `${formatPeso(item.value)} ${item.basis === "PER_UNIT" ? "per unit" : "per row"}`}</option>)}
  </select>;
}

export function SaleDiscountSummary({ discount }: { discount: ReturnType<typeof useItemDiscounts> }) {
  return <section className="w-full space-y-3 rounded-xl border bg-white p-4 text-slate-900">
    {discount.loadError && <p role="alert" className="text-sm text-red-600">{discount.loadError}</p>}
    {discount.error && <p role="alert" className="text-sm text-red-600">{discount.error}</p>}
    <div className="space-y-1 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{formatPeso(discount.preview.subtotal)}</span></div><div className="flex justify-between text-red-600"><span>Product Discounts</span><span>−{formatPeso(discount.preview.discountAmount)}</span></div><div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Total Due</span><span>{formatPeso(discount.preview.totalAmount)}</span></div></div>
    <p className="text-xs text-slate-500">Per-unit discounts multiply by the sale quantity. Per-row discounts deduct once. Other product rows keep their own selections.</p>
  </section>;
}
