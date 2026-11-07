"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Printer, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPeso } from "@/lib/utils";
import { ErpPageHeader } from "@/components/erp/ErpShell";

type PaymentSummaryRow = {
  _id: string;
  customer: string;
  type: "SALE" | "DELIVERY" | "BOTH";
  sales: number;
  paid: number;
  balance: number;
  ownerOutletAmount: number;
  paymentRequired?: boolean;
  paymentStatus?: string;
  packs: number;
};

export function PaymentSummaryPageClient() {
  const [rows, setRows] = useState<PaymentSummaryRow[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [group, setGroup] = useState("ALL");
  const summaryRequest = useRef(0);
  const [isLoading, setIsLoading] = useState(true);

  const totals = useMemo(() => {
    return rows.reduce(
      (sum, row) => ({
        sales: sum.sales + row.sales,
        paid: sum.paid + row.paid,
        balance: sum.balance + row.balance,
        ownerOutletAmount: sum.ownerOutletAmount + Number(row.ownerOutletAmount || 0),
        packs: sum.packs + row.packs,
      }),
      {
        sales: 0,
        paid: 0,
        balance: 0,
        ownerOutletAmount: 0,
        packs: 0,
      }
    );
  }, [rows]);

  async function loadSummary() {
    const request = ++summaryRequest.current;
    setIsLoading(true);
    setRows([]);

    const params = new URLSearchParams();

    if (appliedSearch) {
      params.set("search", appliedSearch);
    }

    if (group !== "ALL") params.set("group", group);

    try {
      const res = await fetch(`/api/payments/summary?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load payment summary.");
      }

      if (request !== summaryRequest.current) return;
      setRows((json.data || []).filter((row: PaymentSummaryRow & { received?: number }) => row.sales !== 0 || row.paid !== 0 || row.balance !== 0 || Number(row.received || 0) !== 0));
    } catch (error) {
      if (request !== summaryRequest.current) return;
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load payment summary."
      );
    } finally {
      if (request === summaryRequest.current) setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, group]);

  function applySearch() {
    setAppliedSearch(search.trim());
  }

  function resetSearch() {
    setSearch("");
    setAppliedSearch("");
    setGroup("ALL");
  }

  function balanceClass(balance: number) {
    if (balance > 0) return "font-bold text-rose-600";
    if (balance < 0) return "font-bold text-emerald-700";
    return "font-bold text-slate-900";
  }

  return (
    <div className="space-y-5">
      <ErpPageHeader title="Customer Balances" />
      <p className="text-sm text-slate-500">External customer balances are collectible. Owner-outlet transactions are internal and require no customer payment.</p>
      <div className="flex flex-wrap gap-2">
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="w-56" aria-label="Customer type">
            <SelectValue placeholder="All Customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Customers</SelectItem>
            <SelectItem value="SALE">External Customers</SelectItem>
            <SelectItem value="OUTLET">Own Outlets</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="min-w-64 flex-1"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customer name..."
          onKeyDown={(event) => {
            if (event.key === "Enter") applySearch();
          }}
        />

        <Button onClick={applySearch}>
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>

        <Button variant="secondary" onClick={resetSearch}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>

        <Button variant="outline" disabled={isLoading} onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print list
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-blue-100">
                <TableRow>
                  <TableHead className="text-center font-bold text-slate-900">
                    Customer
                  </TableHead>
                  <TableHead className="text-center font-bold text-slate-900">
                    Sales (₱)
                  </TableHead>
                  <TableHead className="text-center font-bold text-slate-900">
                    Paid (₱)
                  </TableHead>
                  <TableHead className="text-center font-bold text-slate-900">
                    Outstanding Balance (₱)
                  </TableHead>
                  <TableHead className="text-center font-bold text-slate-900">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No customer transactions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell className="text-center">
                        {row.customer}
                        {row.paymentRequired === false && <p className="text-xs text-slate-500">{row.paymentStatus}</p>}
                      </TableCell>

                      <TableCell className="text-center">
                        {row.sales.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>

                      <TableCell className="text-center">
                        {row.paid.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>

                      <TableCell className={`text-center ${balanceClass(row.balance)}`}>
                        {row.balance.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>

                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant={row.balance > 0 ? "default" : "outline"}
                          className={row.balance > 0 ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                          asChild
                        >
                          <Link href={row.paymentRequired === false ? `/sales/history?customerId=${row._id}` : row.balance > 0 ? `/payments/add?customerId=${row._id}` : `/payments/history?customerId=${row._id}`}>
                            {row.paymentRequired === false ? "View Sales" : row.balance > 0 ? "Record Payment" : "View Transactions"}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}

                {!isLoading && rows.length > 0 ? (
                  <TableRow className="font-bold">
                    <TableCell className="text-center">Total</TableCell>
                    <TableCell className="text-center">
                      {formatPeso(totals.sales)}
                    </TableCell>
                    <TableCell className="text-center">
                      {formatPeso(totals.paid)}
                    </TableCell>
                    <TableCell className={`text-center ${balanceClass(totals.balance)}`}>
                      {formatPeso(totals.balance)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
