"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Data = {
  month: string;
  products: Array<{ id: string; name: string }>;
  selectedProduct: { id: string; name: string };
  rows: Array<{ day: number; beginning: number; stockIn: number; stockOut: number; adjustment: number; balance: number; actual: number }>;
  totals: { stockIn: number; stockOut: number; adjustment: number; endingUnits: number; unitCost: number; unitLabel: string; endingValue: number };
};

const number = (value: number) => Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 });
const money = (value: number) => `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function MonthlyInventoryReportPageClient() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [productId, setProductId] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (productId) params.set("productId", productId);
      const response = await fetch(`/api/reports/monthly-inventory?${params}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || "Unable to load report.");
      setData(json);
      if (!productId && json.selectedProduct?.id) setProductId(json.selectedProduct.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load report.");
    } finally {
      setLoading(false);
    }
  }, [month, productId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="space-y-6 p-6 print:p-0">
      <div className="flex items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold">Monthly Inventory Ledger</h1>
          <p className="text-slate-500">Daily stock roll-forward for one selected product.</p>
        </div>
        <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 size-4" />Print</Button>
      </div>
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4 print:hidden">
        <label className="space-y-1"><span className="block text-sm font-medium">Month</span><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        <label className="min-w-72 space-y-1"><span className="block text-sm font-medium">Product</span><select className="h-10 w-full rounded-md border bg-white px-3" value={productId} onChange={(event) => setProductId(event.target.value)}>{data?.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
      </div>
      {loading ? <div className="flex justify-center py-20"><Loader2 className="size-7 animate-spin" /></div> : data ? (
        <section className="mx-auto max-w-5xl overflow-x-auto rounded-xl border bg-white p-4 print:rounded-none print:border-0 print:p-0">
          <h2 className="text-center text-2xl font-bold">{new Date(`${data.month}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" }).toUpperCase()} INVENTORY</h2>
          <h3 className="my-2 bg-red-100 py-1 text-center font-bold">{data.selectedProduct.name}</h3>
          <table className="w-full table-fixed border-collapse text-xs">
            <thead><tr className="border-y-2 border-black"><th className="p-2">DATE</th><th>BEG</th><th>IN</th><th>OUT</th><th>ADJUSTMENT</th><th>BALANCE</th><th>ACTUAL</th></tr></thead>
            <tbody>{data.rows.map((row) => <tr key={row.day} className="border-b text-center"><td className="p-1">{row.day}</td><td>{number(row.beginning)}</td><td>{number(row.stockIn)}</td><td>{number(row.stockOut)}</td><td>{number(row.adjustment)}</td><td>{number(row.balance)}</td><td className="font-semibold">{number(row.actual)}</td></tr>)}</tbody>
            <tfoot><tr className="border-t-2 border-black text-center font-bold"><td className="p-2">TOTAL / ENDING</td><td /><td>{number(data.totals.stockIn)}</td><td>{number(data.totals.stockOut)}</td><td>{number(data.totals.adjustment)}</td><td /><td>{number(data.totals.endingUnits)}</td></tr></tfoot>
          </table>
          <div className="mx-auto mt-5 grid max-w-xs grid-cols-2 gap-2 border-t pt-3 text-xs"><span>Ending Units</span><strong className="text-center">{number(data.totals.endingUnits)} {data.totals.unitLabel.toLowerCase()}</strong><span>Unit Cost</span><strong className="text-center">{money(data.totals.unitCost)}</strong><span>Ending Inventory Value</span><strong className="text-center">{money(data.totals.endingValue)}</strong></div>
        </section>
      ) : null}
    </main>
  );
}
