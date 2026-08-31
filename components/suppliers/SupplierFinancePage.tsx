"use client";

import { useCallback, useEffect, useState } from "react";

const money = (value: unknown) => `₱${Number(value || 0).toFixed(2)}`;

export function SupplierFinancePage({ mode }: { mode: "invoice" | "payable" }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [form, setForm] = useState<any>({ supplierId: "", invoiceNumber: "", invoiceDate: "", dueDate: "", amount: 0, remarks: "" });
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/supplier-invoices");
    const result = await response.json();
    setInvoices(result.data || []); setSummary(result.summary || {});
    if (mode === "payable") {
      const paymentsResponse = await fetch("/api/accounts-payable/payments");
      const paymentsResult = await paymentsResponse.json();
      setPayments(paymentsResult.data || []);
    }
  }, [mode]);

  useEffect(() => {
    void load();
    void fetch("/api/suppliers?limit=1000").then((response) => response.json()).then((result) => setSuppliers(result.data || []));
  }, [load]);

  async function create() {
    const response = await fetch("/api/supplier-invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json(); setMessage(result.message);
    if (response.ok) { setForm({ supplierId: "", invoiceNumber: "", invoiceDate: "", dueDate: "", amount: 0, remarks: "" }); await load(); }
  }

  async function pay(id: string, balance: number) {
    const entered = window.prompt(`Payment amount (balance ${money(balance)}):`, String(balance));
    if (!entered) return;
    const referenceNumber = window.prompt("Reference number (optional):", "") || "";
    const response = await fetch(`/api/supplier-invoices/${id}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(entered), paymentMethod: "CASH", referenceNumber }) });
    const result = await response.json(); setMessage(result.message);
    if (response.ok) await load();
  }

  return <div className="space-y-6 p-6">
    <div><h1 className="text-3xl font-bold">{mode === "invoice" ? "Supplier Invoices" : "Accounts Payable"}</h1><p className="text-slate-500">{mode === "invoice" ? "Record supplier bills and their due dates." : "Monitor supplier balances and record payments."}</p></div>
    {mode === "invoice" && <div className="grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-6"><label>Supplier<select className="mt-1 w-full rounded-lg border p-3" value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">Select</option>{suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}</select></label><label>Invoice #<input className="mt-1 w-full rounded-lg border p-3" value={form.invoiceNumber} onChange={(event) => setForm({ ...form, invoiceNumber: event.target.value })}/></label><label>Invoice Date<input type="date" className="mt-1 w-full rounded-lg border p-3" value={form.invoiceDate} onChange={(event) => setForm({ ...form, invoiceDate: event.target.value })}/></label><label>Due Date<input type="date" className="mt-1 w-full rounded-lg border p-3" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })}/></label><label>Amount<input type="number" min="0" className="mt-1 w-full rounded-lg border p-3" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })}/></label><button onClick={create} className="self-end rounded-lg bg-slate-950 p-3 text-white">Save Invoice</button></div>}
    <div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border bg-white p-5">Total Invoiced<br/><b className="text-2xl">{money(summary.invoiced)}</b></div><div className="rounded-2xl border bg-white p-5">Paid<br/><b className="text-2xl text-emerald-700">{money(summary.paid)}</b></div><div className="rounded-2xl border bg-white p-5">Outstanding<br/><b className="text-2xl text-red-600">{money(summary.balance)}</b></div></div>
    {message && <p className="font-medium">{message}</p>}
    <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-left"><thead className="bg-slate-950 text-white"><tr><th className="p-3">Supplier</th><th>Invoice #</th><th>Invoice Date</th><th>Due Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{invoices.map((invoice) => <tr className="border-t" key={invoice._id}><td className="p-3">{invoice.supplierId?.name}</td><td>{invoice.invoiceNumber}</td><td>{new Date(invoice.invoiceDate).toLocaleDateString()}</td><td>{new Date(invoice.dueDate).toLocaleDateString()}</td><td>{money(invoice.amount)}</td><td>{money(invoice.paidAmount)}</td><td>{money(invoice.balance)}</td><td>{invoice.status}</td><td>{mode === "payable" && invoice.balance > 0 && <button onClick={() => pay(invoice._id, invoice.balance)} className="rounded bg-emerald-600 px-3 py-1 text-white">Pay</button>}</td></tr>)}</tbody></table></div>
    {mode === "payable" && <div className="overflow-x-auto rounded-2xl border bg-white"><h2 className="p-4 text-xl font-semibold">Supplier Payment History</h2><table className="w-full text-left"><thead className="bg-slate-950 text-white"><tr><th className="p-3">Date</th><th>Supplier</th><th>Invoice #</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>{payments.map((payment) => <tr className="border-t" key={payment._id}><td className="p-3">{new Date(payment.paymentDate).toLocaleDateString()}</td><td>{payment.supplierId?.name}</td><td>{payment.supplierInvoiceId?.invoiceNumber}</td><td>{payment.paymentMethod}</td><td>{payment.referenceNumber || "—"}</td><td>{money(payment.amount)}</td></tr>)}</tbody></table></div>}
  </div>;
}
