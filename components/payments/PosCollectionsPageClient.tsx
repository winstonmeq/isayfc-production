"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPeso } from "@/lib/utils";

type PosCollection = {
  _id: string;
  saleDate: string;
  receiptNumber: string;
  outletCode: string;
  outletName: string;
  cashierName: string;
  shiftId: string;
  shiftStatus: string;
  paymentMethod: string;
  totalAmount: number;
  paidAmount: number;
  cashReceived: number;
  change: number;
  status: string;
};

type OutletOption = { _id: string; name: string; code: string };

export function PosCollectionsPageClient() {
  const [rows, setRows] = useState<PosCollection[]>([]);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [outletId, setOutletId] = useState("ALL");
  const [receipt, setReceipt] = useState("");
  const [limit, setLimit] = useState("25");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalPaid: 0,
    transactionCount: 0,
  });
  const [meta, setMeta] = useState({ page: 1, total: 0, totalPages: 1 });
  const [applied, setApplied] = useState({
    dateFrom: "",
    dateTo: "",
    outletId: "ALL",
    receipt: "",
  });

  async function load(targetPage: number, filters = applied) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(targetPage), limit });
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.outletId !== "ALL") params.set("outletId", filters.outletId);
    if (filters.receipt) params.set("receipt", filters.receipt);

    try {
      const response = await fetch(`/api/payments/pos-collections?${params}`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || "Unable to load POS collections.");
      }
      setRows(json.data || []);
      setOutlets(json.outlets || []);
      setSummary(
        json.summary || {
          totalSales: 0,
          totalPaid: 0,
          transactionCount: 0,
        }
      );
      setMeta(json.meta || { page: targetPage, total: 0, totalPages: 1 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load POS collections.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  const showing = useMemo(() => {
    if (meta.total === 0) return "Showing 0 records";
    const start = (meta.page - 1) * Number(limit) + 1;
    return `Showing ${start}–${Math.min(start + rows.length - 1, meta.total)} of ${meta.total} records`;
  }, [limit, meta, rows.length]);

  function applyFilters() {
    const next = { dateFrom, dateTo, outletId, receipt: receipt.trim() };
    setApplied(next);
    setPage(1);
    void load(1, next);
  }

  function resetFilters() {
    const next = { dateFrom: "", dateTo: "", outletId: "ALL", receipt: "" };
    setDateFrom("");
    setDateTo("");
    setOutletId("ALL");
    setReceipt("");
    setApplied(next);
    setPage(1);
    void load(1, next);
  }

  return (
    <div className="space-y-5">
      <Card className="print:hidden">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto_auto_auto]">
          <div className="space-y-2">
            <Label>Date From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Date To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Outlet</Label>
            <Select value={outletId} onValueChange={setOutletId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Outlets</SelectItem>
                {outlets.map((outlet) => (
                  <SelectItem key={outlet._id} value={outlet._id}>
                    {outlet.code} — {outlet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Receipt</Label>
            <Input value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="Receipt number..." />
          </div>
          <Button className="self-end" onClick={applyFilters}><Search className="mr-2 h-4 w-4" />Apply</Button>
          <Button className="self-end" variant="outline" onClick={resetFilters}><RefreshCcw className="mr-2 h-4 w-4" />Reset</Button>
          <Button className="self-end" variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Transactions</p><p className="mt-1 text-2xl font-bold">{summary.transactionCount.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">POS Sales</p><p className="mt-1 text-2xl font-bold">{formatPeso(summary.totalSales)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Collected</p><p className="mt-1 text-2xl font-bold text-emerald-700">{formatPeso(summary.totalPaid)}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-end justify-between gap-4 print:hidden">
            <p className="text-sm text-muted-foreground">{showing}</p>
            <div className="w-28 space-y-1"><Label>Show</Label><Select value={limit} onValueChange={(value) => { setLimit(value); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[10, 25, 50, 100].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow>
                  {['Date','Receipt','Outlet','Cashier','Shift','Method','Sale','Paid','Cash Received','Change','Status'].map((label) => <TableHead key={label} className="whitespace-nowrap text-white">{label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={11} className="h-32 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={11} className="h-32 text-center text-muted-foreground">No POS collections found.</TableCell></TableRow> : rows.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell className="whitespace-nowrap">{row.saleDate ? new Date(row.saleDate).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>{row.receiptNumber}</TableCell>
                    <TableCell>{row.outletCode || row.outletName || '—'}</TableCell>
                    <TableCell>{row.cashierName}</TableCell>
                    <TableCell><span className="block font-mono text-xs">{row.shiftId ? row.shiftId.slice(-6) : '—'}</span><span className="text-xs text-muted-foreground">{row.shiftStatus}</span></TableCell>
                    <TableCell>{row.paymentMethod}</TableCell>
                    <TableCell className="text-right">{formatPeso(row.totalAmount)}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">{formatPeso(row.paidAmount)}</TableCell>
                    <TableCell className="text-right">{formatPeso(row.cashReceived)}</TableCell>
                    <TableCell className="text-right">{formatPeso(row.change)}</TableCell>
                    <TableCell>{row.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end gap-2 print:hidden">
            <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</Button>
            <Button variant="outline" disabled>{meta.page} / {meta.totalPages}</Button>
            <Button variant="outline" disabled={page >= meta.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
