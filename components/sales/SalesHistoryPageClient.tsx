"use client";

import { useEffect, useState } from "react";
import {
  Eye,
  Loader2,
  Printer,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type CustomerOption = {
  _id: string;
  name: string;
};

type SaleItem = {
  _id: string;
  receiptNumber: string;
  customerName: string;
  saleDate?: string;
  totalAmount: number;
  remarks: string;
  createdByName: string;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function SalesHistoryPageClient() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [sales, setSales] = useState<SaleItem[]>([]);

  const [meta, setMeta] = useState<ApiMeta>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });


  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState("50");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customerId, setCustomerId] = useState("ALL");
  const [receiptNumber, setReceiptNumber] = useState("");

  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: "",
    dateTo: "",
    customerId: "ALL",
    receiptNumber: "",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewData, setViewData] = useState<any>(null);

  async function loadCustomers() {
    const res = await fetch("/api/customers?limit=100", {
      cache: "no-store",
    });

    const json = await res.json();

    if (res.ok && json.success) {
      setCustomers(json.data || []);
    }
  }

  async function loadSales() {
    setIsLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      limit,
    });

    if (appliedFilters.dateFrom) params.set("dateFrom", appliedFilters.dateFrom);
    if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);
    if (appliedFilters.customerId !== "ALL") {
      params.set("customerId", appliedFilters.customerId);
    }
    if (appliedFilters.receiptNumber) {
      params.set("receiptNumber", appliedFilters.receiptNumber);
    }

    try {
      const res = await fetch(`/api/sales?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load sales history.");
      }

      setSales(json.data || []);
      setMeta(
        json.meta || {
          page,
          limit: Number(limit),
          total: 0,
          totalPages: 1,
        }
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load sales history."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCustomers();
  }, []);

  useEffect(() => {
    void loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, appliedFilters]);

  function applyFilters() {
    setAppliedFilters({
      dateFrom,
      dateTo,
      customerId,
      receiptNumber: receiptNumber.trim(),
    });
    setPage(1);
  }

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setCustomerId("ALL");
    setReceiptNumber("");
    setAppliedFilters({
      dateFrom: "",
      dateTo: "",
      customerId: "ALL",
      receiptNumber: "",
    });
    setPage(1);
  }

  async function viewSale(sale: SaleItem) {
    try {
      const res = await fetch(`/api/sales/${sale._id}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load sale details.");
      }

      setViewData(json.data);
      setViewDialogOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load sale details."
      );
    }
  }

  async function voidSale() {
    if (!viewData?._id) return;

    const confirmed = window.confirm(
      `Void sale ${viewData.receiptNumber}? This will reverse stock.`
    );

    if (!confirmed) return;
    const reason = window.prompt("Reason for voiding this sale:")?.trim();
    if (!reason || reason.length < 5) {
      toast.error("Enter a correction reason of at least 5 characters.");
      return;
    }

    try {
      const res = await fetch(`/api/sales/${viewData._id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to void sale.");
      }

      toast.success(json.message || "Sale voided successfully.");
      setViewDialogOpen(false);
      await loadSales();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to void sale.");
    }
  }

  function formatDate(value?: string) {
    if (!value) return "—";
    return new Date(value).toISOString().slice(0, 10);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
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

          <div className="space-y-2">
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer._id} value={customer._id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Receipt # contains</Label>
            <Input
              value={receiptNumber}
              onChange={(event) => setReceiptNumber(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Show</Label>
            <Select
              value={limit}
              onValueChange={(value) => {
                setLimit(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2 xl:col-span-3 xl:justify-end">
            <Button onClick={applyFilters}>
              <Search className="mr-2 h-4 w-4" />
              Apply
            </Button>

            <Button variant="outline" onClick={resetFilters}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print list
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-slate-900">
                <TableRow>
                  <TableHead className="text-center text-white">#</TableHead>
                  <TableHead className="text-center text-white">Date</TableHead>
                  <TableHead className="text-center text-white">
                    Receipt #
                  </TableHead>
                  <TableHead className="text-center text-white">Customer</TableHead>
                  <TableHead className="text-center text-white">Total (₱)</TableHead>
                  <TableHead className="text-center text-white">Remarks</TableHead>
                  <TableHead className="text-center text-white">Created By</TableHead>
                  <TableHead className="text-center text-white">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : sales.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No sales found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.map((sale, index) => (
                    <TableRow key={sale._id}>
                      <TableCell className="text-center">
                        {(meta.page - 1) * meta.limit + index + 1}
                      </TableCell>
                      <TableCell className="text-center">
                        {formatDate(sale.saleDate)}
                      </TableCell>
                      <TableCell className="text-center">
                        {sale.receiptNumber}
                      </TableCell>
                      <TableCell>{sale.customerName}</TableCell>
                      <TableCell className="text-right">
                        {sale.totalAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-center">
                        {sale.remarks || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {sale.createdByName || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => viewSale(sale)}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          View
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

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Sale Details</DialogTitle>
          </DialogHeader>

          {viewData ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg bg-slate-100 p-4 text-sm md:grid-cols-2">
                <p>
                  <strong>Receipt #:</strong> {viewData.receiptNumber}
                </p>
                <p>
                  <strong>Date:</strong> {formatDate(viewData.saleDate)}
                </p>
                <p>
                  <strong>Customer:</strong> {viewData.customerName}
                </p>
                <p>
                  <strong>Source:</strong> {viewData.source}
                </p>
                <p>
                  <strong>Total:</strong> {formatPeso(viewData.totalAmount)}
                </p>
                <p>
                  <strong>Balance:</strong> {formatPeso(viewData.balance)}
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader className="bg-slate-900">
                    <TableRow>
                      <TableHead className="text-center text-white">
                        Product
                      </TableHead>
                      <TableHead className="text-center text-white">
                        Source
                      </TableHead>
                      <TableHead className="text-center text-white">
                        Qty
                      </TableHead>
                      <TableHead className="text-center text-white">
                        Price
                      </TableHead>
                      <TableHead className="text-center text-white">
                        Line Total
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {viewData.lines?.map((line: any) => (
                      <TableRow key={line._id}>
                        <TableCell className="text-center">
                          {line.productName}
                        </TableCell>
                        <TableCell className="text-center">
                          {line.source}
                        </TableCell>
                        <TableCell className="text-center">{line.qty}</TableCell>
                        <TableCell className="text-center">
                          {formatPeso(line.price)}
                        </TableCell>
                        <TableCell className="text-center">
                          {formatPeso(line.lineTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end">
                <Button variant="destructive" onClick={voidSale}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Void Sale
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
