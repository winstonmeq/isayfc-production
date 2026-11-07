"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readApiResponse } from "@/lib/api-response";
import { manilaDateString } from "@/lib/date-utils";

type Row = { id: string; userName: string; roleName: string; status: string; reason: string; loginAt: string; logoutAt?: string; lastActivityAt?: string; activity: string };
type Result = { success: boolean; message?: string; rows: Row[]; total: number; page: number; totalPages: number; limit: number };
const dateTime = (value?: string) => value ? new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "short", timeStyle: "medium" }) : "—";

export function LoginHistoryPageClient() {
  const today = manilaDateString();
  const [search, setSearch] = useState(""), [from, setFrom] = useState(today), [to, setTo] = useState(today), [status, setStatus] = useState("ALL");
  const [filters, setFilters] = useState({ search: "", from: today, to: today, status: "ALL" });
  const [page, setPage] = useState(1), [limit, setLimit] = useState(25), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<Result | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/login-history?${new URLSearchParams({ ...filters, page: String(page), limit: String(limit) })}`, { cache: "no-store", signal: controller.signal });
        const result = await readApiResponse<Result>(response);
        if (!response.ok || !result.success) throw new Error(result.message || "Unable to load login history.");
        if (!controller.signal.aborted) setData(result);
      } catch (failure) { if (!controller.signal.aborted) { setData(null); setError(failure instanceof Error ? failure.message : "Unable to load login history."); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [filters, page, limit, refresh]);
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Login History</h1><Button variant="outline" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</Button></div>
    <p className="text-sm text-slate-500">Web sign-ins only. Recently active means interaction within 5 minutes, not guaranteed online. Logout appears only after explicit sign-out. Tracking starts after deployment; refresh to update activity.</p>
    <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4" onSubmit={event => { event.preventDefault(); setPage(1); setFilters({ search, from, to, status }); setRefresh(value => value + 1); }}>
      <label className="min-w-52 flex-1 text-sm">User<Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search user name" maxLength={160} /></label>
      <label className="text-sm">Login Date From<Input type="date" max={today} value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label className="text-sm">Date To<Input type="date" min={from} max={today} value={to} onChange={event => setTo(event.target.value)} /></label>
      <label className="text-sm">Result<select className="block h-10 rounded-md border bg-white px-3" value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All Results</option><option value="SUCCESS">Successful</option><option value="FAILED">Failed</option></select></label>
      <Button disabled={loading}>Filter</Button><Button type="button" variant="outline" onClick={() => { setSearch(""); setFrom(today); setTo(today); setStatus("ALL"); setPage(1); setFilters({ search: "", from: today, to: today, status: "ALL" }); }}>Reset</Button>
    </form>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
    <section className="overflow-hidden rounded-xl border bg-white"><div className="overflow-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-100"><tr>{["User", "Role at Login", "Login / Attempt (Manila)", "Result", "Last Activity (Manila)", "Logout (Manila)", "Activity", "Details"].map(label => <th key={label} className="p-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y">
      {loading ? <tr><td colSpan={8} className="p-10 text-center" role="status">Loading…</td></tr> : data?.rows.map(row => <tr key={row.id}><td className="p-3 font-medium">{row.userName}</td><td className="p-3">{row.roleName || "—"}</td><td className="p-3">{dateTime(row.loginAt)}</td><td className={`p-3 font-semibold ${row.status === "SUCCESS" ? "text-emerald-700" : "text-red-700"}`}>{row.status === "SUCCESS" ? "Successful" : "Failed"}</td><td className="p-3">{dateTime(row.lastActivityAt)}</td><td className="p-3">{dateTime(row.logoutAt)}</td><td className="p-3">{row.activity}</td><td className="p-3">{row.reason || "—"}</td></tr>)}
      {!loading && !data?.rows.length && <tr><td colSpan={8} className="p-10 text-center text-slate-500">No login records found.</td></tr>}
    </tbody></table></div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm"><div className="flex items-center gap-3"><label>Rows <select aria-label="Rows per page" className="rounded border bg-white p-2" value={limit} onChange={event => { setLimit(Number(event.target.value)); setPage(1); }}>{[25, 50, 100].map(value => <option key={value}>{value}</option>)}</select></label><span>{data?.total || 0} records</span></div><div className="flex items-center gap-3"><Button variant="outline" disabled={loading || !data || data.page <= 1} onClick={() => setPage((data?.page || 1) - 1)}>Previous</Button><span>Page {data?.page || 1} of {data?.totalPages || 1}</span><Button variant="outline" disabled={loading || !data || data.page >= data.totalPages} onClick={() => setPage((data?.page || 1) + 1)}>Next</Button></div></footer>
    </section>
  </div>;
}
