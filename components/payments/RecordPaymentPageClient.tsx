"use client";

import { EntryActions } from "@/components/erp/EntryForm";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { manilaDateString } from "@/lib/date-utils";

type Props = {
  initialCustomerId?: string;
};

type CustomerSummary = {
  _id: string;
  customer: string;
  type: string;
  sales: number;
  paid: number;
  balance: number;
  packs: number;
};

type CustomerDetail = {
  customer: {
    _id: string;
    name: string;
  };
  overall: {
    totalSales: number;
    totalPaid: number;
    balance: number;
    totalPacks: number;
  };
  filtered: {
    totalSales: number;
    totalPaid: number;
    balance: number;
    totalPacks: number;
  };
  recentSales: RecentSale[];
  unpaidSales: RecentSale[];
};

type RecentSale = {
  _id: string;
  saleDate?: string;
  receiptNumber: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  totalPacks: number;
  remarks: string;
  status: string;
};

export function RecordPaymentPageClient({ initialCustomerId = "" }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const detailRequest = useRef(0);

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [paymentDate, setPaymentDate] = useState(
    manilaDateString()
  );
  const [amount, setAmount] = useState("0");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const [receiptImage, setReceiptImage] = useState<File | null>(null);

  const [acceptAdvance, setAcceptAdvance] = useState(false);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer._id === customerId);
  }, [customers, customerId]);

  async function loadCustomers() {
    setIsLoadingCustomers(true);

    try {
      const res = await fetch("/api/payments/summary", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load customers.");
      }

      setCustomers(json.data || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load customers."
      );
    } finally {
      setIsLoadingCustomers(false);
    }
  }

  async function loadCustomerDetail() {
    const request = ++detailRequest.current;
    if (!customerId) {
      setDetail(null);
      return;
    }

    setIsLoadingDetail(true);

    try {
      const res = await fetch(
        `/api/payments/customer/${customerId}`,
        {
          cache: "no-store",
        }
      );

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load customer payment data.");
      }

      if (request === detailRequest.current) setDetail(json);
    } catch (error) {
      if (request !== detailRequest.current) return;
      setDetail(null);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load customer payment data."
      );
    } finally {
      if (request === detailRequest.current) setIsLoadingDetail(false);
    }
  }

  useEffect(() => {
    void loadCustomers();
  }, []);

  useEffect(() => {
    void loadCustomerDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  function formatDate(value?: string) {
    if (!value) return "—";
    return new Date(value).toISOString().slice(0, 10);
  }

  function balanceClass(balance: number) {
    if (balance > 0) return "font-bold text-rose-600";
    if (balance < 0) return "font-bold text-emerald-700";
    return "font-bold text-slate-900";
  }

  async function savePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!customerId) {
      toast.error("Please select customer.");
      return;
    }

    if (!paymentDate) {
      toast.error("Payment date is required.");
      return;
    }

    if ((Number(amount) || 0) <= 0) {
      toast.error("Payment amount must be greater than zero.");
      return;
    }

    if (isSaving || isLoadingCustomers || isLoadingDetail || !selectedCustomer || !detail) return;
    if (Number(amount) > selectedCustomer.balance && !acceptAdvance) {
      toast.error("Confirm the advance / excess credit before saving."); return;
    }
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const correctionReason =
      paymentDate < today
        ? window.prompt("Reason for entering this payment late (required):")?.trim()
        : "";

    if (paymentDate < today && (!correctionReason || correctionReason.length < 5)) {
      toast.error("Enter a late-entry reason of at least 5 characters.");
      return;
    }

    setIsSaving(true);

    try {
      const formData = new FormData();

      formData.set("customerId", customerId);
      formData.set("paymentDate", paymentDate);
      formData.set("amount", amount);
      formData.set("referenceNumber", referenceNumber);
      formData.set("remarks", remarks);
      formData.set("correctionReason", correctionReason || "");

      if (receiptImage) {
        formData.set("receiptImage", receiptImage);
      }

      const res = await fetch("/api/payments", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save payment.");
      }

      toast.success(json.message || "Payment saved successfully.");

      setAmount("0");
      setAcceptAdvance(false);
      setReferenceNumber("");
      setRemarks("");
      setReceiptImage(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await loadCustomers();
      await loadCustomerDetail();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save payment."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Record Payment
      </h1>

      <Card>
        <CardContent className="p-5">
          <form onSubmit={savePayment} className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>
                  Customer <span className="text-rose-600">*</span>
                </Label>

                <Select
                  value={customerId}
                  onValueChange={(value) => { setCustomerId(value); setDetail(null); setAcceptAdvance(false); }}
                  disabled={isLoadingCustomers || isSaving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="-- Select customer --" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer._id} value={customer._id}>
                        {customer.customer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedCustomer ? (
                  <p className="text-xs">
                    Balance:{" "}
                    <span className={balanceClass(selectedCustomer.balance)}>
                      {formatPeso(selectedCustomer.balance)}
                    </span>
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>
                  Payment Date <span className="text-rose-600">*</span>
                </Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Amount (₱) <span className="text-rose-600">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => { setAmount(event.target.value); setAcceptAdvance(false); }}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Reference No.</Label>
                <Input
                  value={referenceNumber}
                  onChange={(event) => setReferenceNumber(event.target.value)}
                  placeholder="OR # / Check # / etc."
                />
              </div>

              <div className="space-y-2">
                <Label>Receipt Image</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={(event) =>
                    setReceiptImage(event.target.files?.[0] || null)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Allowed: JPG, JPEG, PNG, GIF, WEBP. Max: 5MB.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Remarks</Label>
                <Input
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                />
              </div>
            </div>

            {selectedCustomer && Number(amount) > selectedCustomer.balance && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><p>{selectedCustomer.balance <= 0 ? "This customer has no outstanding balance. This payment will be an advance." : "This payment exceeds the outstanding balance. The excess will remain as unapplied credit."}</p><label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={acceptAdvance} onChange={event => setAcceptAdvance(event.target.checked)} />I confirm recording the advance / excess credit.</label></div>}
            {selectedCustomer && selectedCustomer.balance <= 0 && Number(amount) <= 0 && <p role="status" className="text-sm text-amber-800">No outstanding balance. Any new payment will be an advance.</p>}
            <EntryActions>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={isSaving || isLoadingCustomers || isLoadingDetail || !selectedCustomer || !detail || Number(amount) <= 0 || (Number(amount) > selectedCustomer.balance && !acceptAdvance)}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Record Payment
              </Button>
            </EntryActions>
          </form>
        </CardContent>
      </Card>

      {customerId && <Card><CardHeader><CardTitle>Unpaid Invoices</CardTitle></CardHeader><CardContent>
        {isLoadingDetail ? <p role="status">Loading invoices…</p> : !detail ? <p>Unable to load invoices. Select the customer again before recording payment.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Receipt / Invoice</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Outstanding</TableHead></TableRow></TableHeader><TableBody>
        {(detail.unpaidSales || []).map(sale => <TableRow key={sale._id}><TableCell>{formatDate(sale.saleDate)}</TableCell><TableCell>{sale.receiptNumber}</TableCell><TableCell className="text-right">{formatPeso(sale.totalAmount)}</TableCell><TableCell className="text-right">{formatPeso(sale.paidAmount)}</TableCell><TableCell className="text-right font-bold">{formatPeso(sale.balance)}</TableCell></TableRow>)}
        {!detail.unpaidSales?.length && <TableRow><TableCell colSpan={5} className="py-8 text-center">No unpaid invoices.</TableCell></TableRow>}
        </TableBody></Table></div>}
        <p className="mt-3 text-sm text-slate-500">Payments are applied automatically to eligible unpaid sales. Any excess remains unapplied credit.</p>
      </CardContent></Card>}
    </div>
  );
}
