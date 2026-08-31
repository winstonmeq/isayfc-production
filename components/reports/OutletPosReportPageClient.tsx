"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ReportShell, StatCard, buildRangeParams, peso, qtyFmt, type Preset } from "./ReportShell";

type Report = {
  range: { start: string; end: string };
  generatedAt: string;
  outlets: Array<{ id: string; name: string; code: string }>;
  rows: Array<{ id: string; saleDate: string; receiptNumber: string; outletName: string; outletCode: string; qty: number; items: string; sales: number; cogs: number; grossProfit: number; paid: number; paymentMethod: string; status: string }>;
  outletRows: Array<{ outletId: string; name: string; code: string; transactions: number; sales: number; cogs: number; grossProfit: number; expenses: number; netProfit: number }>;
  products: Array<{ product: string; category: string; qty: number; sales: number; cogs: number; grossProfit: number }>;
  totals: { transactions: number; sales: number; cogs: number; grossProfit: number; expenses: number; netProfit: number };
};

export function OutletPosReportPageClient() {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [outletId, setOutletId] = useState("ALL");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (preset === "custom" && (!from || !to)) return toast.error("Pick both a start and end date.");
    setLoading(true);
    try {
      const params = buildRangeParams({ preset, from, to });
      if (outletId !== "ALL") params.set("outletId", outletId);
      const response = await fetch(`/api/reports/outlet-pos?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load outlet POS report.");
      setData(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load outlet POS report.");
    } finally { setLoading(false); }
  }, [preset, from, to, outletId]);

  useEffect(() => { if (preset !== "custom") void load(); }, [load, preset]);
  const periodLabel = data ? `${new Date(data.range.start).toLocaleDateString()} – ${new Date(new Date(data.range.end).getTime() - 1).toLocaleDateString()}` : undefined;

  return <ReportShell title="Outlet POS Report" subtitle="Outlet-only sales, historical COGS, operating expenses, and final profit. Main-branch sales are excluded." generatedAt={data?.generatedAt} periodLabel={periodLabel} preset={preset} from={from} to={to} onPreset={setPreset} onFrom={setFrom} onTo={setTo} onApply={load} extraFilters={<label className="text-xs font-semibold text-slate-600">Outlet<select className="ml-2 h-10 rounded-lg border bg-white px-3 text-sm" value={outletId} onChange={(event) => setOutletId(event.target.value)}><option value="ALL">All Outlets</option>{data?.outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name} ({outlet.code})</option>)}</select></label>}>
    {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div> : data ? <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6"><StatCard label="Transactions" value={qtyFmt(data.totals.transactions)} /><StatCard label="Outlet Sales" value={peso(data.totals.sales)} /><StatCard label="COGS" value={peso(data.totals.cogs)} /><StatCard label="Gross Profit" value={peso(data.totals.grossProfit)} highlight="good" /><StatCard label="Expenses" value={peso(data.totals.expenses)} /><StatCard label="Net Profit" value={peso(data.totals.netProfit)} highlight={data.totals.netProfit < 0 ? "bad" : "good"} /></div>
      <ReportTable title="Outlet Summary"><thead><tr><Th>Outlet</Th><Th right>Transactions</Th><Th right>Sales</Th><Th right>COGS</Th><Th right>Gross Profit</Th><Th right>Expenses</Th><Th right>Net Profit</Th></tr></thead><tbody>{data.outletRows.map((row) => <tr key={row.outletId} className="border-t"><Td>{row.name} ({row.code})</Td><Td right>{row.transactions}</Td><Td right>{peso(row.sales)}</Td><Td right>{peso(row.cogs)}</Td><Td right>{peso(row.grossProfit)}</Td><Td right>{peso(row.expenses)}</Td><Td right strong>{peso(row.netProfit)}</Td></tr>)}</tbody><tfoot><tr className="border-t-2 bg-slate-100 font-black"><Td>TOTAL</Td><Td right>{data.totals.transactions}</Td><Td right>{peso(data.totals.sales)}</Td><Td right>{peso(data.totals.cogs)}</Td><Td right>{peso(data.totals.grossProfit)}</Td><Td right>{peso(data.totals.expenses)}</Td><Td right>{peso(data.totals.netProfit)}</Td></tr></tfoot></ReportTable>
      <ReportTable title="Outlet POS Transactions"><thead><tr><Th>Date</Th><Th>Outlet</Th><Th>Receipt</Th><Th>Products</Th><Th right>Qty</Th><Th right>Sales</Th><Th right>COGS</Th><Th right>Gross Profit</Th><Th>Payment</Th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.id} className="border-t"><Td>{new Date(row.saleDate).toLocaleString("en-PH")}</Td><Td>{row.outletName}</Td><Td>{row.receiptNumber}</Td><Td>{row.items || "—"}</Td><Td right>{row.qty}</Td><Td right>{peso(row.sales)}</Td><Td right>{peso(row.cogs)}</Td><Td right strong>{peso(row.grossProfit)}</Td><Td>{row.paymentMethod}</Td></tr>)}{!data.rows.length && <tr><td colSpan={9} className="p-10 text-center text-slate-500">No outlet POS transactions in this period.</td></tr>}</tbody></ReportTable>
      <ReportTable title="Product Summary"><thead><tr><Th>Category</Th><Th>Product</Th><Th right>Qty Sold</Th><Th right>Sales</Th><Th right>COGS</Th><Th right>Gross Profit</Th></tr></thead><tbody>{data.products.map((row) => <tr key={`${row.category}-${row.product}`} className="border-t"><Td>{row.category}</Td><Td>{row.product}</Td><Td right>{row.qty}</Td><Td right>{peso(row.sales)}</Td><Td right>{peso(row.cogs)}</Td><Td right strong>{peso(row.grossProfit)}</Td></tr>)}</tbody></ReportTable>
    </div> : null}
  </ReportShell>;
}

function ReportTable({ title, children }: { title: string; children: React.ReactNode }) { return <section><h2 className="mb-2 text-lg font-black">{title}</h2><div className="overflow-x-auto rounded-2xl border"><table className="w-full min-w-[900px] text-sm">{children}</table></div></section>; }
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) { return <th className={`bg-slate-50 p-3 font-semibold text-slate-600 ${right ? "text-right" : "text-left"}`}>{children}</th>; }
function Td({ children, right, strong }: { children: React.ReactNode; right?: boolean; strong?: boolean }) { return <td className={`p-3 ${right ? "text-right tabular-nums" : "text-left"} ${strong ? "font-bold" : ""}`}>{children}</td>; }
