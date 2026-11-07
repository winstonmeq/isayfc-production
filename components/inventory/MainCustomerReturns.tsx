"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TablePagination } from "@/components/erp/TablePagination";
import { paginateTable } from "@/lib/table-pagination";
import { readApiResponse } from "@/lib/api-response";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
type Line = { id: string; receipt: string; productName: string; quantity: number; unit: string; netAmount: number };
type Row = { _id: string; createdAt: string; updatedAt: string; receiptNumber: string; productName: string; inventoryType: string; quantity: number; unit: string; creditAmount: number; condition: string; reason: string; status: string; reviewReason?: string; cashRefund?: number; balanceCredit?: number; refundReference?: string; restocked?: boolean; postedAt?: string };
type Detail = { canReview: boolean; canPost: boolean; settlement: { credit: number; refund: number; balance: number }; row: Row; customer: string; sale?: { totalAmount: number; paidAmount: number; balance: number } };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export function MainCustomerReturns({ reviewMode = false }: { reviewMode?: boolean }) {
  const [statusFilter, setStatusFilter] = useState(reviewMode ? "PENDING_REVIEW" : "ALL");
  const [detail, setDetail] = useState<Detail | null>(null), [reviewReason, setReviewReason] = useState("");
  const [confirmRestock, setConfirmRestock] = useState(false), [confirmRefund, setConfirmRefund] = useState(false), [refundReference, setRefundReference] = useState("");
  async function openReview(id: string) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/customer-returns/${id}/review`, { cache: "no-store" });
      const data = await readApiResponse<Detail & { success: boolean; message?: string }>(response);
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to open return.");
      setDetail(data); setReviewReason(""); setConfirmRestock(false); setConfirmRefund(false); setRefundReference("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to open return."); }
    finally { setBusy(false); }
  }
  async function decide(decision: "APPROVE" | "REJECT" | "POST") {
    if (!detail || lock.current) return;
    lock.current = true; setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/customer-returns/${detail.row._id}/${decision === "POST" ? "post" : "review"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason: reviewReason, expectedUpdatedAt: detail.row.updatedAt, confirmRestock, confirmRefund, refundReference, expectedCredit: detail.settlement.credit, expectedRefund: detail.settlement.refund }) });
      const data = await readApiResponse<{ success: boolean; message: string }>(response);
      if (!response.ok || !data.success) throw new Error(data.message);
      await load(); setDetail(null); setNotice(data.message);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to review return."); }
    finally { lock.current = false; setBusy(false); }
  }
  const [rows, setRows] = useState<Row[]>([]), [lines, setLines] = useState<Line[]>([]);
  const [receipt, setReceipt] = useState(""), [lineId, setLineId] = useState(""), [qty, setQty] = useState("");
  const [condition, setCondition] = useState("RESTOCKABLE"), [reason, setReason] = useState(""), [query, setQuery] = useState("");
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [page, setPage] = useState(1), [size, setSize] = useState(25);
  const key = useRef(""), lock = useRef(false);
  async function load() {
    const response = await fetch("/api/customer-returns", { cache: "no-store" });
    const data = await readApiResponse<{ success: boolean; rows: Row[]; message?: string }>(response);
    if (!response.ok || !data.success) throw new Error(data.message || "Unable to load returns.");
    setRows(data.rows);
  }
  useEffect(() => { void load().catch(error => setNotice(error.message)); }, []);
  async function search() {
    if (!receipt.trim() || busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/customer-returns?receipt=${encodeURIComponent(receipt)}`);
      const data = await readApiResponse<{ success: boolean; lines: Line[]; message?: string }>(response);
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to search sales.");
      setLines(data.lines); setLineId(""); if (!data.lines.length) setNotice("No eligible external customer sales found.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to search."); }
    finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setNotice(""); key.current ||= crypto.randomUUID();
    try {
      const response = await fetch("/api/customer-returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saleLineId: lineId, quantity: Number(qty), condition, reason, requestKey: key.current }) });
      const data = await readApiResponse<{ success: boolean; message: string }>(response);
      if (!response.ok || !data.success) throw new Error(data.message);
      key.current = ""; setQty(""); setReason(""); await load(); setNotice(data.message);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to record return."); }
    finally { lock.current = false; setBusy(false); }
  }
  const selected = lines.find(line => line.id === lineId);
  const filtered = rows.filter(row => (statusFilter === "ALL" || row.status === statusFilter) && `${row.receiptNumber} ${row.productName} ${row.status}`.toLowerCase().includes(query.toLowerCase()));
  const pagination = paginateTable(filtered, page, size);
  return <section className="space-y-4 p-6"><h1 className="text-2xl font-semibold">{reviewMode ? "Return Reviews" : "Customer Returns"}</h1>
    <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">Submit a return, approve it in Return Reviews, then post it. Posting credits the unpaid balance first and records any confirmed refund. Only inspected, restockable goods return to inventory.</p>
    {notice && <p role="status" className="rounded border p-3">{notice}</p>}
    {!reviewMode && <><form className="flex gap-3" onSubmit={event => { event.preventDefault(); void search(); }}><Input aria-label="Original receipt" className="max-w-md" placeholder="Search original sales receipt" required value={receipt} onChange={event => setReceipt(event.target.value)} /><Button disabled={busy}>Find Sale</Button></form>
    <form onSubmit={submit} onChange={() => { key.current = ""; }} className="space-y-4 rounded-lg border bg-white p-5"><div className="grid gap-4 md:grid-cols-3"><label>Original Sold Product<select required disabled={busy} className="mt-1 w-full rounded border p-2" value={lineId} onChange={event => setLineId(event.target.value)}><option value="">Select original sale item</option>{lines.map(line => <option key={line.id} value={line.id}>{line.receipt} — {line.productName} — {line.quantity} {line.unit}</option>)}</select></label><label>Return Quantity ({selected?.unit || "original sale unit"})<Input required disabled={busy} type="number" min="0.000001" max={selected?.quantity} step="any" value={qty} onChange={event => setQty(event.target.value)} /></label><label>Condition<select disabled={busy} className="mt-1 w-full rounded border p-2" value={condition} onChange={event => setCondition(event.target.value)}><option value="RESTOCKABLE">Good / Restockable after review</option><option value="DAMAGED">Damaged / Not for sellable stock</option></select></label></div><label className="block">Reason<Input required disabled={busy} minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label><div className="flex items-center justify-between"><p>Estimated return credit: {money.format(selected && selected.quantity ? Number(qty || 0) * selected.netAmount / selected.quantity : 0)}</p><Button disabled={busy || !selected}>Submit for Review</Button></div></form></>}
    <div className="overflow-hidden rounded-lg border bg-white"><div className="flex flex-wrap gap-3 p-4"><select aria-label="Return status" className="rounded border p-2" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }}>{["ALL", "PENDING_REVIEW", "APPROVED_AWAITING_POSTING", "POSTED", "REJECTED", "CANCELLED"].map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select><Input className="max-w-md" placeholder="Search receipt, product or status" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><div className="overflow-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-slate-100"><tr>{["Date", "Receipt", "Inventory", "Product", "Qty", "Credit", "Condition", "Status", "Reason", "Action"].map(title => <th className="p-3 text-left" key={title}>{title}</th>)}</tr></thead><tbody>{pagination.rows.map(row => <tr className="border-t" key={row._id}><td className="p-3">{new Date(row.createdAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</td><td className="p-3">{row.receiptNumber}</td><td className="p-3">{row.inventoryType}</td><td className="p-3">{row.productName}</td><td className="p-3">{row.quantity} {row.unit}</td><td className="p-3">{money.format(row.creditAmount)}</td><td className="p-3">{row.condition}</td><td className="p-3">{row.status.replaceAll("_", " ")}</td><td className="p-3">{row.reason}</td><td className="p-3"><Button variant="outline" disabled={busy} onClick={() => void openReview(row._id)}>{row.status === "PENDING_REVIEW" ? "Review" : row.status === "APPROVED_AWAITING_POSTING" ? "Post / View" : "View"}</Button></td></tr>)}{!filtered.length && <tr><td colSpan={10} className="p-8 text-center">No customer return requests.</td></tr>}</tbody></table></div><TablePagination {...pagination} disabled={busy} onPageChange={setPage} onPageSizeChange={value => { setSize(value); setPage(1); }} /></div>
    <Dialog open={!!detail} onOpenChange={open => { if (!open && !busy) setDetail(null); }}><DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl"><DialogTitle>Review Customer Return</DialogTitle>{detail && <div className="space-y-4"><p>{detail.customer} — Receipt {detail.row.receiptNumber}</p><p>{detail.row.productName}: {detail.row.quantity} {detail.row.unit} — {money.format(detail.row.creditAmount)}</p><p>Condition: {detail.row.condition} · Status: {detail.row.status.replaceAll("_", " ")}</p><p>Return reason: {detail.row.reason}</p><p>Sale: {money.format(detail.sale?.totalAmount || 0)} · Paid: {money.format(detail.sale?.paidAmount || 0)} · Balance: {money.format(detail.sale?.balance || 0)}</p><p className="rounded bg-amber-50 p-3 text-sm">Approval alone does not move stock or money. Post Return applies the settlement once. Refund confirmation records cash actually paid to the customer; it does not send money automatically.</p>{notice && <p role="status">{notice}</p>}{detail.row.status === "PENDING_REVIEW" && detail.canReview ? <><label className="block">Review reason<Input minLength={5} maxLength={1000} disabled={busy} value={reviewReason} onChange={event => setReviewReason(event.target.value)} /></label><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy || reviewReason.trim().length < 5} onClick={() => void decide("REJECT")}>Reject</Button><Button disabled={busy || reviewReason.trim().length < 5} onClick={() => void decide("APPROVE")}>Approve — Awaiting Posting</Button></div></> : <div className="space-y-3"><p>Review reason: {detail.row.reviewReason || "—"}</p><p>Balance credit: {money.format(detail.settlement.credit)} · Cash refund: {money.format(detail.settlement.refund)}</p>{detail.row.status === "APPROVED_AWAITING_POSTING" && detail.canPost && <><label className="block">Posting reason<Input value={reviewReason} maxLength={1000} disabled={busy} onChange={event => setReviewReason(event.target.value)} /></label>{detail.row.condition === "RESTOCKABLE" && <label className="flex gap-2"><input type="checkbox" checked={confirmRestock} onChange={event => setConfirmRestock(event.target.checked)} disabled={busy} />Goods inspected and confirmed sellable</label>}{detail.settlement.refund > 0 && <><Input aria-label="Refund reference" placeholder="Cash refund receipt / reference" value={refundReference} onChange={event => setRefundReference(event.target.value)} maxLength={200} /><label className="flex gap-2"><input type="checkbox" checked={confirmRefund} onChange={event => setConfirmRefund(event.target.checked)} disabled={busy} />I confirm this cash refund has been paid</label></>}<Button disabled={busy || reviewReason.trim().length < 5 || (detail.row.condition === "RESTOCKABLE" && !confirmRestock) || (detail.settlement.refund > 0 && (!confirmRefund || refundReference.trim().length < 3))} onClick={() => void decide("POST")}>Post Return</Button></>}{detail.row.status === "APPROVED_AWAITING_POSTING" && !detail.canPost && <p>Posting requires Inventory Adjustments and Payment management permissions.</p>}{detail.row.status === "POSTED" && <p>Posted: {detail.row.postedAt && new Date(detail.row.postedAt).toLocaleString("en-PH")} · {detail.row.restocked ? "Stock restored" : "Not restocked"} · Refund reference: {detail.row.refundReference || "None"}</p>}</div>}<div className="flex justify-end"><Button variant="outline" disabled={busy} onClick={() => setDetail(null)}>Close</Button></div></div>}</DialogContent></Dialog>
  </section>;
}
