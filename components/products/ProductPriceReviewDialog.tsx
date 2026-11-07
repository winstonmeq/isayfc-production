"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EntryDialogContent } from "@/components/erp/EntryForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPeso } from "@/lib/utils";

type Review = {
  product: { name: string; buyingPrice: number; unitPrice: number; lastPurchaseCost?: number; priceReviewPreviousCost?: number; priceReviewRequired?: boolean; updatedAt: string };
  canApprove: boolean;
  history: { _id: string; previousPrice: number; sellingPrice: number; buyingCost: number; reason: string; createdAt: string; approvedBy?: { name?: string } }[];
};
export function ProductPriceReviewDialog({ productId, onClose, onSaved }: { productId: string; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<Review | null>(null);
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/products/${productId}/price-review`, { cache: "no-store" }).then(async res => {
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Unable to load price review.");
      if (active) { setData(json); setPrice(String(json.product.unitPrice)); }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Unable to load price review."); });
    return () => { active = false; };
  }, [productId]);
  async function approve() {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${productId}/price-review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellingPrice: Number(price), reason, expectedUpdatedAt: data.product.updatedAt }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Price approval failed.");
      toast.success(json.message); onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Price approval failed."); }
    finally { setBusy(false); }
  }
  const margin = data && Number(price) > 0 ? ((Number(price) - data.product.buyingPrice) / Number(price)) * 100 : null;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <EntryDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>Review Selling Price</DialogTitle></DialogHeader>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!data && !error && <p>Loading...</p>}
      {data && <>
        <p className="font-semibold">{data.product.name}</p>
        {data.product.priceReviewRequired && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">Price review required before a new sale.</p>}
        <table className="w-full text-sm"><tbody>
          <tr><td className="p-2">Previous inventory unit cost</td><td>{data.product.priceReviewPreviousCost === undefined ? "—" : formatPeso(data.product.priceReviewPreviousCost)}</td></tr>
          <tr><td className="p-2">Current inventory unit cost</td><td>{formatPeso(data.product.buyingPrice)}</td></tr>
          <tr><td className="p-2">Latest purchase unit cost</td><td>{data.product.lastPurchaseCost === undefined ? "—" : formatPeso(data.product.lastPurchaseCost)}</td></tr>
          <tr><td className="p-2">Current selling price</td><td>{formatPeso(data.product.unitPrice)}</td></tr>
        </tbody></table>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="review-price">Approved selling price</Label><Input id="review-price" type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} disabled={!data.canApprove || busy} /></div>
          <div className="space-y-2"><Label htmlFor="review-reason">Approval reason</Label><Input id="review-reason" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="Updated price / retain current price" disabled={!data.canApprove || busy} /></div>
        </div>
        <p className={margin !== null && margin < 0 ? "text-red-600" : "text-muted-foreground"}>Gross margin at this price: {margin === null ? "—" : `${margin.toFixed(2)}%`} (before discounts and expenses)</p>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr>{["Approved", "From", "To", "Cost", "By / Reason"].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>
          {data.history.map(row => <tr key={row._id} className="border-b"><td className="p-2">{new Date(row.createdAt).toLocaleString()}</td><td>{formatPeso(row.previousPrice)}</td><td>{formatPeso(row.sellingPrice)}</td><td>{formatPeso(row.buyingCost)}</td><td>{row.approvedBy?.name || "—"}<span className="block text-muted-foreground">{row.reason}</span></td></tr>)}
          {!data.history.length && <tr><td colSpan={5} className="p-3 text-center">No price approvals recorded yet.</td></tr>}
        </tbody></table></div>
        <p className="text-xs text-muted-foreground">Latest 50 approvals. Existing sales retain their original price.</p>
      </>}
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>{data?.canApprove && <Button onClick={approve} disabled={busy || !(Number(price) > 0) || reason.trim().length < 3}>{busy ? "Approving..." : "Approve Price"}</Button>}</DialogFooter>
    </EntryDialogContent>
  </Dialog>;
}
