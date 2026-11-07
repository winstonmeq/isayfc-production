import { peso } from "./ReportShell";

export type OwnerOutletAllocations = {
  count: number; transferValue: number; actualCost: number; missingCostLines: number; outstandingBalance?: number;
  rows: Array<{ id: string; date: string; receiptNumber: string; outlet: string; products: string;
    quantity: number; transferValue: number; actualCost: number; missingCostLines: number; outstandingBalance?: number }>;
};

export function OwnerOutletAllocationsTable({ data }: { data: OwnerOutletAllocations }) {
  const showBalance = data.outstandingBalance !== undefined;
  return <section className="space-y-3 print-break">
    <h2 className="text-lg font-bold">Owner Outlet Deliveries — Overall Eliminations</h2>
    <p className="text-sm text-slate-500">Internal outlet sales and their main-branch COGS are excluded from combined income. Receipt adds outlet inventory, not operating expenses. Overall COGS uses original company cost when the outlet sells the goods.</p>
    {showBalance && <p className="text-sm text-slate-500">Owner outlets require no customer payment. Internal deliveries do not create outside-customer receivables.</p>}
    {data.missingCostLines > 0 && <p role="alert" className="rounded bg-amber-50 p-3 text-amber-900">{data.missingCostLines} allocation lines have missing cost snapshots. Costs shown are incomplete; the main operating result is provisional.</p>}
    <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm">
      <thead className="bg-slate-100"><tr>{["Received", "Reference", "Owner-Owned Outlet", "Products", "Internal Sale Eliminated", "Main COGS Eliminated", ...(showBalance ? ["Customer Payment Due"] : [])].map((label) => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead>
      <tbody>{data.rows.length ? data.rows.map((row) => <tr key={row.id} className="border-t">
        <td className="p-3">{new Date(row.date).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</td>
        <td className="p-3">{row.receiptNumber}</td><td className="p-3">{row.outlet}</td><td className="p-3">{row.products}</td>
        <td className="p-3 text-right">{peso(row.transferValue)}</td><td className="p-3 text-right">{peso(row.actualCost)}{row.missingCostLines > 0 ? " (incomplete)" : ""}</td>{showBalance && <td className="p-3 text-right">{peso(row.outstandingBalance || 0)}</td>}
      </tr>) : <tr><td colSpan={showBalance ? 7 : 6} className="p-6 text-center text-slate-500">No received owner-outlet deliveries in this period.</td></tr>}</tbody>
      <tfoot className="border-t-2 bg-slate-100 font-bold"><tr><td className="p-3" colSpan={4}>TOTAL ({data.count})</td><td className="p-3 text-right">{peso(data.transferValue)}</td><td className="p-3 text-right">{peso(data.actualCost)}</td>{showBalance && <td className="p-3 text-right">{peso(data.outstandingBalance || 0)}</td>}</tr></tfoot>
    </table></div>
  </section>;
}
