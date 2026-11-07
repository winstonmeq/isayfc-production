"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { manilaDateString } from "@/lib/date-utils";

type CreditRow = { _id: string; saleDate: string; receiptNumber: string; employeeName?: string; source: string; employee: { name: string; code: string }[]; outlet: { name: string }[]; credit: number; paid: number; balance: number };
type Totals = { count: number; credit: number; paid: number; balance: number };
const money = (n: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n || 0);
const field = "h-10 rounded-md border bg-white px-3 text-sm";
const button = "rounded-md border bg-white px-3 py-2 text-sm disabled:opacity-40";

async function read(response: Response) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(json?.message || "Unable to load employee credits. Please retry.");
  return json;
}

export function EmployeeCreditsPageClient() {
  const { data: session } = useSession();
  const canManage = session?.user?.role === "ADMIN" || session?.user?.permissions?.includes("payments.manage");
  const [rows, setRows] = useState<CreditRow[]>([]), [totals, setTotals] = useState<Totals>({ count: 0, credit: 0, paid: 0, balance: 0 });
  const [page, setPage] = useState(1), [limit, setLimit] = useState(25);
  const [filters, setFilters] = useState({ employee: "", source: "", status: "", dateFrom: "", dateTo: "" });
  const [applied, setApplied] = useState(filters), [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [notice, setNotice] = useState("");
  const [register, setRegister] = useState(false), [code, setCode] = useState(""), [name, setName] = useState("");
  const [employees, setEmployees] = useState<{ _id: string; code: string; name: string }[]>([]);
  const [collect, setCollect] = useState<CreditRow | null>(null), [amount, setAmount] = useState("");
  const [date, setDate] = useState(manilaDateString()), [reference, setReference] = useState(""), [remarks, setRemarks] = useState("");
  const requestKey = useRef("");
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    readFetch();
    async function readFetch() {
      try { const result = await read(await fetch(`/api/employee-credits?${new URLSearchParams({ ...applied, page: String(page), limit: String(limit) })}`, { signal: controller.signal, cache: "no-store" })); setRows(result.rows); setTotals(result.totals); }
      catch (error) { if (!controller.signal.aborted) setNotice((error as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    return () => controller.abort();
  }, [applied, page, limit, version]);

  const loadEmployees = useCallback(async () => { try { const result = await read(await fetch("/api/employees", { cache: "no-store" })); setEmployees(result.employees); } catch (error) { setNotice((error as Error).message); } }, []);
  useEffect(() => { if (register) void loadEmployees(); }, [register, loadEmployees]);

  async function saveEmployee() {
    setBusy(true); setNotice("");
    try { await read(await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name }) })); setCode(""); setName(""); await loadEmployees(); setNotice("Employee registered. Select this employee when recording a main or outlet credit sale."); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function saveCollection() {
    if (!collect) return;
    setBusy(true); setNotice("");
    try { await read(await fetch("/api/employee-credits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saleId: collect._id, amount, date, reference, remarks, requestKey: requestKey.current }) })); setCollect(null); setVersion(v => v + 1); setNotice("Collection recorded at main. Original credit balance updated."); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function view(row: CreditRow) {
    setNotice(""); setBusy(true);
    try { const result = await read(await fetch(`/api/employee-credits?saleId=${row._id}`, { cache: "no-store" })); setDetail(result); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  const pages = Math.max(1, Math.ceil(totals.count / limit));
  return <div className="space-y-4 p-4 md:p-6">
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Employee Credits</h1>{canManage && <button className={button} onClick={() => { setNotice(""); setRegister(true); }}>Employees</button>}</div>
    {notice && <p role="status" className="rounded-md border bg-slate-50 p-3 text-sm">{notice}</p>}
    <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4" onSubmit={e => { e.preventDefault(); setPage(1); setApplied({ ...filters }); }}>
      <label className="grid gap-1 text-sm">Employee<input className={field} placeholder="Name or employee code" value={filters.employee} onChange={e => setFilters({ ...filters, employee: e.target.value })} /></label>
      <label className="grid gap-1 text-sm">Source<select className={field} value={filters.source} onChange={e => setFilters({ ...filters, source: e.target.value })}><option value="">All locations</option><option value="MAIN">Main / Bodega / Grocery</option><option value="OUTLET">Outlet</option></select></label>
      <label className="grid gap-1 text-sm">Status<select className={field} value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">All credits</option><option value="UNPAID">Outstanding</option><option value="PAID">Settled</option></select></label>
      <label className="grid gap-1 text-sm">Sale date from<input className={field} type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} /></label>
      <label className="grid gap-1 text-sm">Date to<input className={field} type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} /></label>
      <button className={button}>Filter</button><button type="button" className={button} onClick={() => { const empty = { employee: "", source: "", status: "", dateFrom: "", dateTo: "" }; setFilters(empty); setApplied(empty); setPage(1); }}>Reset</button>
    </form>
    <div className="overflow-hidden rounded-lg border bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead className="bg-slate-100"><tr>{["Date", "Employee", "Source / Outlet", "Receipt", "Credit", "Paid / Settled", "Balance", "Action"].map(x => <th className="p-3 text-left" key={x}>{x}</th>)}</tr></thead><tbody>
      {rows.map(row => <tr key={row._id} className="border-t"><td className="p-3">{new Date(row.saleDate).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</td><td className="p-3">{row.employee[0]?.name || row.employeeName || "Legacy employee"}<p className="text-xs text-slate-500">{row.employee[0]?.code}</p></td><td className="p-3">{row.outlet[0]?.name || (row.source === "CHICKEN" ? "Main — Bodega" : row.source === "BODEGA" ? "Main — Grocery" : "Main")}</td><td className="p-3">{row.receiptNumber}</td><td className="p-3 text-right">{money(row.credit)}</td><td className="p-3 text-right">{money(row.paid)}</td><td className="p-3 text-right font-semibold">{money(row.balance)}</td><td className="p-3"><div className="flex gap-2"><button className={button} disabled={busy} onClick={() => void view(row)}>View</button>{canManage && row.balance > 0 && <button className={button} disabled={busy} onClick={() => { setNotice(""); setAmount(String(row.balance)); setDate(manilaDateString()); setReference(""); setRemarks(""); requestKey.current = crypto.randomUUID(); setCollect(row); }}>Collect</button>}</div></td></tr>)}
      {!rows.length && <tr><td colSpan={8} className="p-10 text-center text-slate-500">{loading ? "Loading…" : "No employee credits match the filters."}</td></tr>}
    </tbody><tfoot className="border-t bg-slate-100 font-semibold"><tr><td colSpan={4} className="p-3">Filtered total ({totals.count}, all pages)</td><td className="p-3 text-right">{money(totals.credit)}</td><td className="p-3 text-right">{money(totals.paid)}</td><td className="p-3 text-right">{money(totals.balance)}</td><td /></tr></tfoot></table></div>
    <div className="flex items-center justify-between gap-3 border-t p-4 text-sm"><label>Rows <select className={field} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>{[25, 50, 100].map(n => <option key={n}>{n}</option>)}</select></label><div className="flex items-center gap-3"><button className={button} disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</button>Page {page} of {pages}<button className={button} disabled={page >= pages || loading} onClick={() => setPage(p => p + 1)}>Next</button></div></div></div>
    <Dialog open={register} onOpenChange={open => { if (!busy) setRegister(open); }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Employees</DialogTitle></DialogHeader>{notice && <p role="status" className="text-sm">{notice}</p>}<div className="flex flex-wrap gap-2"><input aria-label="Employee code" className={field} placeholder="Employee code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} /><input aria-label="Employee name" className={field} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} /><button className={button} disabled={busy || !code || !name} onClick={() => void saveEmployee()}>Add Employee</button></div><div className="max-h-72 overflow-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Code</th><th className="p-2 text-left">Name</th></tr></thead><tbody>{employees.map(e => <tr className="border-t" key={e._id}><td className="p-2">{e.code}</td><td className="p-2">{e.name}</td></tr>)}</tbody></table></div><button className={button} disabled={busy} onClick={() => setRegister(false)}>Close</button></DialogContent></Dialog>
    <Dialog open={!!collect} onOpenChange={open => { if (!open && !busy) setCollect(null); }}><DialogContent><DialogHeader><DialogTitle>Collect Employee Credit</DialogTitle></DialogHeader><p className="text-sm">{collect?.receiptNumber} · Balance {money(collect?.balance || 0)}</p><p className="text-sm text-slate-500">Cash received at main. This does not add another sale.</p>{notice && <p role="alert" className="text-sm text-red-600">{notice}</p>}<label className="grid gap-1 text-sm">Collection date<input className={field} type="date" max={manilaDateString()} value={date} onChange={e => setDate(e.target.value)} /></label><label className="grid gap-1 text-sm">Amount<input className={field} type="number" min="0.01" step="0.01" max={collect?.balance} value={amount} onChange={e => setAmount(e.target.value)} /></label><label className="grid gap-1 text-sm">Reference<input className={field} value={reference} onChange={e => setReference(e.target.value)} /></label><label className="grid gap-1 text-sm">Remarks / backdate reason<input className={field} value={remarks} onChange={e => setRemarks(e.target.value)} /></label><div className="flex justify-end gap-2"><button className={button} disabled={busy} onClick={() => setCollect(null)}>Cancel</button><button className={button} disabled={busy || Number(amount) <= 0 || Number(amount) > (collect?.balance || 0)} onClick={() => void saveCollection()}>{busy ? "Saving…" : "Record Collection"}</button></div></DialogContent></Dialog>
    <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{detail?.sale?.receiptNumber}</DialogTitle></DialogHeader><div className="max-h-[65vh] space-y-4 overflow-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Product</th><th>Qty</th><th>Amount</th></tr></thead><tbody>{detail?.items?.map((item: any) => <tr className="border-t" key={item._id}><td className="p-2">{item.productName}</td><td className="text-center">{item.qty} {item.unitCode || item.stockUnit}</td><td className="text-right">{money(item.lineTotal)}</td></tr>)}</tbody></table><h3 className="font-semibold">Collections</h3>{detail?.allocations?.filter((a: any) => a.paymentId && !a.paymentId.isVoided).map((a: any) => <p className="text-sm" key={a._id}>{new Date(a.paymentId.paymentDate).toLocaleDateString("en-PH")} · Main · {money(a.amount)} · {a.paymentId.referenceNumber}</p>)}{detail?.collections?.map((c: any) => <p className="text-sm" key={c._id}>{new Date(c.businessDate).toLocaleDateString("en-PH")} · {c.receivedAt === "MAIN" ? "Main" : "Outlet"} · {money(c.amount)}</p>)}<p className="text-sm">Current balance: {detail ? money(Math.max(0, detail.sale.totalAmount - (detail.sale.returnedAmount || 0) - (detail.sale.paidAmount || 0) + (detail.sale.refundedAmount || 0))) : ""}</p></div><button className={button} onClick={() => setDetail(null)}>Close</button></DialogContent></Dialog>
  </div>;
}
