"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErpPage, ErpPageHeader } from "@/components/erp/ErpShell";
import { manilaDateString } from "@/lib/date-utils";
import { formatPeso } from "@/lib/utils";

export function InternalOutletsReport() {
  const [from, setFrom] = useState(() => `${manilaDateString().slice(0, 7)}-01`), [to, setTo] = useState(() => manilaDateString());
  const [range, setRange] = useState({ from, to });
  const [data, setData] = useState<any>(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError("");
    fetch(`/api/reports/internal-outlets?from=${range.from}&to=${range.to}&preset=custom`, { signal: controller.signal, cache: "no-store" }).then(async response => { const json = await response.json(); if (!response.ok) throw new Error(json.message || "Unable to load report."); return json; }).then(setData).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [range]);
  const amount = (value: number | null) => value == null ? "Cost review required" : formatPeso(value);
  return <ErpPage><ErpPageHeader title="Internal Deliveries & Company Profit" />
    <form className="flex flex-wrap items-end gap-3 print:hidden" onSubmit={event => { event.preventDefault(); setRange({ from, to }); }}><label>Date From<Input required type="date" value={from} onChange={event => setFrom(event.target.value)}/></label><label>Date To<Input required type="date" min={from} value={to} onChange={event => setTo(event.target.value)}/></label><Button>Filter</Button><Button type="button" variant="outline" onClick={() => window.print()}>Print</Button></form>
    {error ? <p role="alert" className="text-red-600">{error}</p> : !data ? <p>Loading…</p> : <>
      <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="font-bold">Consolidated Company Profit</h2><p className="text-sm text-slate-500">External customer sales only. Internal delivery values and internal markups are eliminated. Outlet COGS uses original company cost, not the internal selling price. Remittances and employee reimbursements are not new revenue or operating expenses.</p>{data.consolidated.missingCostLines > 0 && <p role="alert" className="text-amber-800">{data.consolidated.missingCostLines} sale lines / records lack original cost snapshots. Final company profit is withheld until reviewed; legacy cost is never guessed from marked-up prices.</p>}<table className="w-full text-sm"><tbody>{[["Main external sales",data.consolidated.mainSales],["Outlet customer sales",data.consolidated.outletSales],["Total external revenue",data.consolidated.revenue],["Original company COGS",data.consolidated.cogs],["Operating expenses (main + outlets)",data.consolidated.expenses],["Company net profit",data.consolidated.netProfit]].map(([label,value]) => <tr key={String(label)} className="border-b last:bg-slate-100 last:font-bold"><td className="p-3">{label}</td><td className="p-3 text-right">{amount(value as number | null)}</td></tr>)}</tbody></table></section>
      <section className="overflow-x-auto rounded-xl border bg-white"><h2 className="p-4 font-bold">Internal Outlet Deliveries — Not External Sales</h2><table className="w-full text-sm"><thead className="bg-slate-950 text-white"><tr>{["Date", "Delivery", "Outlet", "Products", "Status", "Internal Value", "Original Cost", "Internal Markup", "Finance Review"].map(label => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{data.rows.map((row: any) => <tr className="border-t" key={row.id}><td className="p-3">{manilaDateString(new Date(row.date))}</td><td>{row.number}</td><td>{row.outlet}</td><td className="max-w-sm p-3">{row.products}</td><td>{row.status}</td><td>{amount(row.value)}</td><td>{amount(row.originalCost)}</td><td>{amount(row.internalMarkup)}</td><td className="p-3 text-sm">{row.financeReview}</td></tr>)}</tbody></table><p className="p-4 text-sm text-slate-500">Values above are dispatch quantities, including drafts/in-transit where shown. Internal markup is a branch performance measure, not additional consolidated company profit.</p></section>
    </>}
  </ErpPage>;
}
