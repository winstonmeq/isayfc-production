"use client";

import { useCallback, useEffect, useState } from "react";
import { EntryDialogContent } from "@/components/erp/EntryForm";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const money = (value: unknown) => `₱${Number(value || 0).toFixed(2)}`;

export function SupplierFinancePage({ mode }: { mode: "invoice" | "payable" | "history" }) {
  const [filters, setFilters] = useState({ supplierId: "", dateFrom: "", dateTo: "" });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [form, setForm] = useState<any>({ supplierId: "", invoiceNumber: "", invoiceDate: "", dueDate: "", amount: 0, remarks: "" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ ...applied, page: String(page) });
      const response = await fetch(mode === "history" ? `/api/accounts-payable/payments?${params}` : `/api/supplier-invoices?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to load records.");
      setInvoices(result.data || []); setPayments(result.data || []); setSummary(result.summary || {});
      setMeta(result.meta || { total: 0, totalPages: 1 });
    } catch (error) { setInvoices([]); setPayments([]); setSummary({}); setMessage((error as Error).message); }
    finally { setLoading(false); }
  }, [mode, applied, page]);

  useEffect(() => {
    void load();
    void fetch("/api/suppliers?limit=1000").then((response) => response.json()).then((result) => setSuppliers(result.data || []));
  }, [load]);

  async function create() {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/supplier-invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json(); setMessage(result.message);
      if (response.ok) { setForm({ supplierId: "", invoiceNumber: "", invoiceDate: "", dueDate: "", amount: 0, remarks: "" }); await load(); }
    } catch { setMessage("Unable to save invoice. Check your connection before retrying."); }
    finally { setSaving(false); }
  }

  async function pay() {
    if (!paymentInvoice) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/supplier-invoices/${paymentInvoice._id}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(paymentAmount), paymentMethod: "CASH", referenceNumber: paymentReference.trim() }) });
      const result = await response.json(); setMessage(result.message);
      if (response.ok) { setPaymentInvoice(null); await load(); }
    } catch { setMessage("Unable to confirm payment. Check payment history before retrying."); }
    finally { setSaving(false); }
  }

  return <div className="space-y-6 p-6">
    <div><h1 className="text-3xl font-bold">{mode === "invoice" ? "Supplier Invoices" : mode === "history" ? "Supplier Payment History" : "Accounts Payable"}</h1><p className="text-slate-500">{mode === "invoice" ? "Record supplier bills and their due dates." : mode === "history" ? "Review supplier payments by supplier and payment date." : "Monitor supplier balances and record payments."}</p></div>
    {mode === "invoice" && <form onSubmit={(event) => { event.preventDefault(); if (!saving) void create(); }} className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"><label>Supplier<select required disabled={saving} className="mt-1 h-10 w-full rounded-lg border bg-white px-3" value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">Select</option>{suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}</select></label><label>Invoice #<input required disabled={saving} className="mt-1 h-10 w-full rounded-lg border px-3" value={form.invoiceNumber} onChange={(event) => setForm({ ...form, invoiceNumber: event.target.value })}/></label><label>Invoice Date<input required disabled={saving} type="date" className="mt-1 h-10 w-full rounded-lg border px-3" value={form.invoiceDate} onChange={(event) => setForm({ ...form, invoiceDate: event.target.value })}/></label><label>Due Date<input required disabled={saving} type="date" className="mt-1 h-10 w-full rounded-lg border px-3" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })}/></label><label>Amount<input required disabled={saving} type="number" min="0.01" step="0.01" className="mt-1 h-10 w-full rounded-lg border px-3" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })}/></label><div className="flex items-end justify-end gap-2"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div></form>}
    {mode !== "invoice" && <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4" onSubmit={event => { event.preventDefault(); setPage(1); setApplied({ ...filters }); setMessage(""); }}>
      <label>Supplier<select className="mt-1 block h-10 rounded-lg border px-3" value={filters.supplierId} onChange={event => setFilters({ ...filters, supplierId: event.target.value })}><option value="">All Suppliers</option>{suppliers.map(supplier => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}</select></label>
      <label>{mode === "history" ? "Payment" : "Invoice"} Date From<Input type="date" value={filters.dateFrom} onChange={event => setFilters({ ...filters, dateFrom: event.target.value })} /></label>
      <label>Date To<Input type="date" min={filters.dateFrom || undefined} value={filters.dateTo} onChange={event => setFilters({ ...filters, dateTo: event.target.value })} /></label>
      <Button disabled={loading}>Filter</Button><Button type="button" variant="outline" onClick={() => { const empty = { supplierId: "", dateFrom: "", dateTo: "" }; setFilters(empty); setApplied(empty); setPage(1); }}>Reset</Button>
    </form>}
    {mode !== "history" &&     <div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border bg-white p-5">Total Invoiced<br/><b className="text-2xl">{money(summary.invoiced)}</b></div><div className="rounded-2xl border bg-white p-5">Paid<br/><b className="text-2xl text-emerald-700">{money(summary.paid)}</b></div><div className="rounded-2xl border bg-white p-5">Outstanding<br/><b className="text-2xl text-red-600">{money(summary.balance)}</b></div></div>}
    {message && <p role="status" className="font-medium">{message}</p>}
    {mode !== "history" && <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-left"><thead className="bg-slate-950 text-white"><tr><th className="p-3">Supplier</th><th>Invoice #</th><th>Invoice Date</th><th>Due Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th>Source</th><th>Action</th></tr></thead><tbody>{invoices.map((invoice) => <tr className="border-t" key={invoice._id}><td className="p-3">{invoice.supplierId?.name}</td><td>{invoice.invoiceNumber}</td><td>{new Date(invoice.invoiceDate).toLocaleDateString()}</td><td>{new Date(invoice.dueDate).toLocaleDateString()}</td><td>{money(invoice.amount)}</td><td>{money(invoice.paidAmount)}</td><td>{money(invoice.balance)}</td><td>{invoice.status}</td><td>{invoice.referenceType === "PURCHASE_BATCH" ? "Grocery Purchase" : invoice.referenceType === "DELIVERY" ? "Chicken Delivery" : "Manual Invoice"}</td><td>{mode === "payable" && invoice.balance > 0 && <button disabled={saving} onClick={() => { setPaymentInvoice(invoice); setPaymentAmount(String(invoice.balance)); setPaymentReference(""); setMessage(""); }} className="rounded bg-emerald-600 px-3 py-1 text-white">Pay</button>}</td></tr>)}</tbody><tfoot className="border-t bg-slate-100 font-bold"><tr><td colSpan={4} className="p-3">Filtered Total</td><td>{money(summary.invoiced)}</td><td>{money(summary.paid)}</td><td>{money(summary.balance)}</td><td colSpan={3}/></tr></tfoot></table></div>}
    {mode === "history" && <div className="overflow-x-auto rounded-2xl border bg-white"><h2 className="p-4 text-xl font-semibold">Supplier Payment History</h2><table className="w-full text-left"><thead className="bg-slate-950 text-white"><tr><th className="p-3">Date</th><th>Supplier</th><th>Invoice #</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>{payments.map((payment) => <tr className="border-t" key={payment._id}><td className="p-3">{new Date(payment.paymentDate).toLocaleDateString()}</td><td>{payment.supplierId?.name}</td><td>{payment.supplierInvoiceId?.invoiceNumber}</td><td>{payment.paymentMethod}</td><td>{payment.referenceNumber || "—"}</td><td>{money(payment.amount)}</td></tr>)}</tbody><tfoot className="border-t bg-slate-100 font-bold"><tr><td colSpan={5} className="p-3">Filtered Total</td><td>{money(summary.paid)}</td></tr></tfoot></table></div>}
    {loading && <p role="status">Loading…</p>}
    {!loading && invoices.length === 0 && <p>No records match the selected filters.</p>}
    {<div className="flex items-center justify-between"><span>{meta.total} records · Page {page} of {meta.totalPages}</span><div className="flex gap-2"><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" disabled={loading || page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
    <Dialog open={Boolean(paymentInvoice)} onOpenChange={(open) => { if (!open && !saving) setPaymentInvoice(null); }}>
      <EntryDialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Supplier Payment</DialogTitle><DialogDescription>Record a cash payment against the selected supplier invoice.</DialogDescription></DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); if (!saving) void pay(); }} className="space-y-4">
          <div className="rounded-lg border bg-slate-50 p-3 text-sm"><strong>{paymentInvoice?.supplierId?.name}</strong><p>Invoice {paymentInvoice?.invoiceNumber}</p><p className="mt-2 font-bold">Balance: {money(paymentInvoice?.balance)}</p></div>
          <label className="block space-y-1 text-sm font-medium">Amount *<Input required disabled={saving} type="number" min="0.01" step="0.01" max={paymentInvoice?.balance} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label>
          <label className="block space-y-1 text-sm font-medium">Reference<Input disabled={saving} placeholder="Optional" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label>
          {message && <p role="status" className="text-sm text-amber-800">{message}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setPaymentInvoice(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Recording…" : "Record Payment"}</Button></DialogFooter>
        </form>
      </EntryDialogContent>
    </Dialog>
  </div>;
}
