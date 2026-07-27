"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  Loader2,
  Printer,
  RefreshCcw,
  Save,
  Search,
  Trash2,
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
  recentPayments: RecentPayment[];
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

type RecentPayment = {
  _id: string;
  paymentDate?: string;
  amount: number;
  appliedAmount: number;
  unappliedAmount: number;
  referenceNumber: string;
  receiptImageUrl: string;
  remarks: string;
};

export function RecordPaymentPageClient({ initialCustomerId = "" }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [amount, setAmount] = useState("0");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const [receiptImage, setReceiptImage] = useState<File | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: "",
    dateTo: "",
  });

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
    if (!customerId) {
      setDetail(null);
      return;
    }

    setIsLoadingDetail(true);

    const params = new URLSearchParams();

    if (appliedFilters.dateFrom) {
      params.set("dateFrom", appliedFilters.dateFrom);
    }

    if (appliedFilters.dateTo) {
      params.set("dateTo", appliedFilters.dateTo);
    }

    try {
      const res = await fetch(
        `/api/payments/customer/${customerId}?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load customer payment data.");
      }

      setDetail(json);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load customer payment data."
      );
    } finally {
      setIsLoadingDetail(false);
    }
  }

  useEffect(() => {
    void loadCustomers();
  }, []);

  useEffect(() => {
    void loadCustomerDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, appliedFilters]);

  function applyFilters() {
    setAppliedFilters({
      dateFrom,
      dateTo,
    });
  }

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setAppliedFilters({
      dateFrom: "",
      dateTo: "",
    });
  }

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

  async function voidPayment(paymentId: string) {
    const confirmed = window.confirm(
      "Void this payment? This will reverse its applied amount from sales."
    );

    if (!confirmed) return;
    const reason = window.prompt("Reason for voiding this payment:")?.trim();
    if (!reason || reason.length < 5) {
      toast.error("Enter a correction reason of at least 5 characters.");
      return;
    }

    try {
      const res = await fetch(`/api/payments/${paymentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to void payment.");
      }

      toast.success(json.message || "Payment voided successfully.");

      await loadCustomers();
      await loadCustomerDetail();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to void payment."
      );
    }
  }

  async function voidSale(saleId: string) {
    const confirmed = window.confirm(
      "Delete this sale? This will reverse stock if the sale has no payment."
    );

    if (!confirmed) return;
    const reason = window.prompt("Reason for voiding this sale:")?.trim();
    if (!reason || reason.length < 5) {
      toast.error("Enter a correction reason of at least 5 characters.");
      return;
    }

    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to delete sale.");
      }

      toast.success(json.message || "Sale deleted successfully.");

      await loadCustomers();
      await loadCustomerDetail();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete sale.");
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
                  onValueChange={(value) => setCustomerId(value)}
                  disabled={isLoadingCustomers}
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
                  onChange={(event) => setAmount(event.target.value)}
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
                <Label>Payment Remarks</Label>
                <Input
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Payment
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {customerId ? (
        <>
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Filter (Sales Date / Payment Date)</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_auto]">
              <div className="space-y-2">
                <Label>Date From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Date To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </div>

              <div className="flex items-end">
                <Button variant="outline" onClick={applyFilters}>
                  <Search className="mr-2 h-4 w-4" />
                  Apply Filter
                </Button>
              </div>

              <div className="flex items-end">
                <Button variant="secondary" onClick={clearFilters}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <CardTitle>
                Customer Summary: {detail?.customer?.name || selectedCustomer?.customer || "—"}
              </CardTitle>

              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
            </CardHeader>

            <CardContent className="space-y-5 p-5">
              {isLoadingDetail ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : detail ? (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-center">
                            Total Sales (Overall)
                          </TableHead>
                          <TableHead className="text-center">
                            Total Paid (Overall)
                          </TableHead>
                          <TableHead className="text-center">
                            Balance (Overall)
                          </TableHead>
                          <TableHead className="text-center">
                            Total Packs Sold (Overall)
                          </TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        <TableRow>
                          <TableCell className="text-center">
                            {formatPeso(detail.overall.totalSales)}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatPeso(detail.overall.totalPaid)}
                          </TableCell>
                          <TableCell
                            className={`text-center ${balanceClass(
                              detail.overall.balance
                            )}`}
                          >
                            {formatPeso(detail.overall.balance)}
                          </TableCell>
                          <TableCell className="text-center">
                            {detail.overall.totalPacks.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-semibold">
                      Filtered Totals{" "}
                      <span className="font-normal text-muted-foreground">
                        {appliedFilters.dateFrom || appliedFilters.dateTo
                          ? "(filter applied)"
                          : "(no filter applied)"}
                      </span>
                    </p>

                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-center">
                              Total Sales (Filtered)
                            </TableHead>
                            <TableHead className="text-center">
                              Total Paid (Filtered)
                            </TableHead>
                            <TableHead className="text-center">
                              Balance (Filtered)
                            </TableHead>
                            <TableHead className="text-center">
                              Total Packs Sold (Filtered)
                            </TableHead>
                          </TableRow>
                        </TableHeader>

                        <TableBody>
                          <TableRow>
                            <TableCell className="text-center">
                              {formatPeso(detail.filtered.totalSales)}
                            </TableCell>
                            <TableCell className="text-center">
                              {formatPeso(detail.filtered.totalPaid)}
                            </TableCell>
                            <TableCell
                              className={`text-center ${balanceClass(
                                detail.filtered.balance
                              )}`}
                            >
                              {formatPeso(detail.filtered.balance)}
                            </TableCell>
                            <TableCell className="text-center">
                              {detail.filtered.totalPacks.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          {detail ? (
            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle>Recent Sales Orders</CardTitle>
                </CardHeader>

                <CardContent className="p-4">
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader className="bg-slate-900">
                        <TableRow>
                          <TableHead className="text-center text-white">
                            Date
                          </TableHead>
                          <TableHead className="text-center text-white">
                            Receipt #
                          </TableHead>
                          <TableHead className="text-center text-white">
                            Total
                          </TableHead>
                          <TableHead className="text-center text-white">
                            Packs
                          </TableHead>
                          <TableHead className="text-center text-white">
                            Remarks
                          </TableHead>
                          <TableHead className="text-center text-white">
                            Action
                          </TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {detail.recentSales.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="h-24 text-center text-muted-foreground"
                            >
                              No sales found for the selected date range.
                            </TableCell>
                          </TableRow>
                        ) : (
                          detail.recentSales.map((sale) => (
                            <TableRow key={sale._id}>
                              <TableCell className="text-center">
                                {formatDate(sale.saleDate)}
                              </TableCell>
                              <TableCell className="text-center">
                                {sale.receiptNumber}
                              </TableCell>
                              <TableCell className="text-center">
                                {formatPeso(sale.totalAmount)}
                              </TableCell>
                              <TableCell className="text-center">
                                {sale.totalPacks.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-center">
                                {sale.remarks || sale.status || "—"}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center gap-2">
                                  <Button size="sm" variant="outline" asChild>
                                    <Link href={`/sales/history`}>
                                      <Eye className="mr-1 h-4 w-4" />
                                      View
                                    </Link>
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => voidSale(sale._id)}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <CardTitle>Recent Payments</CardTitle>
                </CardHeader>

                <CardContent className="p-4">
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader className="bg-slate-900">
                        <TableRow>
                          <TableHead className="text-center text-white">
                            Date
                          </TableHead>
                          <TableHead className="text-center text-white">
                            Reference
                          </TableHead>
                          <TableHead className="text-center text-white">
                            Amount
                          </TableHead>
                          <TableHead className="text-center text-white">
                            Applied
                          </TableHead>
                          <TableHead className="text-center text-white">
                            Receipt
                          </TableHead>
                          <TableHead className="text-center text-white">
                            Action
                          </TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {detail.recentPayments.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="h-24 text-center text-muted-foreground"
                            >
                              No payments found for the selected date range.
                            </TableCell>
                          </TableRow>
                        ) : (
                          detail.recentPayments.map((payment) => (
                            <TableRow key={payment._id}>
                              <TableCell className="text-center">
                                {formatDate(payment.paymentDate)}
                              </TableCell>
                              <TableCell className="text-center">
                                {payment.referenceNumber || "—"}
                              </TableCell>
                              <TableCell className="text-center">
                                {formatPeso(payment.amount)}
                              </TableCell>
                              <TableCell className="text-center">
                                {formatPeso(payment.appliedAmount)}
                              </TableCell>
                              <TableCell className="text-center">
                                {payment.receiptImageUrl ? (
                                  <a
                                    href={payment.receiptImageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 underline"
                                  >
                                    View
                                  </a>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => voidPayment(payment._id)}
                                >
                                  <Trash2 className="mr-1 h-4 w-4" />
                                  Void
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
