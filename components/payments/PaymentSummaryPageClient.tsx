"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPeso } from "@/lib/utils";

type PaymentSummaryRow = {
  _id: string;
  customer: string;
  type: "SALE" | "DELIVERY" | "BOTH";
  sales: number;
  paid: number;
  balance: number;
  packs: number;
};

type CustomerGroup = "ALL" | "OUTLET" | "SALE";

export function PaymentSummaryPageClient() {
  const [rows, setRows] = useState<PaymentSummaryRow[]>([]);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<CustomerGroup>("ALL");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const totals = useMemo(() => {
    return rows.reduce(
      (sum, row) => ({
        sales: sum.sales + row.sales,
        paid: sum.paid + row.paid,
        balance: sum.balance + row.balance,
        packs: sum.packs + row.packs,
      }),
      {
        sales: 0,
        paid: 0,
        balance: 0,
        packs: 0,
      }
    );
  }, [rows]);

  async function loadSummary() {
    setIsLoading(true);

    const params = new URLSearchParams();

    if (appliedSearch) {
      params.set("search", appliedSearch);
    }

    if (group !== "ALL") {
      params.set("group", group);
    }

    try {
      const res = await fetch(`/api/payments/summary?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load payment summary.");
      }

      setRows(json.data || []);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load payment summary."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, appliedSearch]);

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
      <div className="flex flex-wrap gap-2">
        <Button
          variant={group === "ALL" ? "default" : "outline"}
          onClick={() => setGroup("ALL")}
        >
          All
        </Button>

        <Button
          variant={group === "OUTLET" ? "default" : "outline"}
          onClick={() => setGroup("OUTLET")}
        >
          Outlet
        </Button>

        <Button
          variant={group === "SALE" ? "default" : "outline"}
          onClick={() => setGroup("SALE")}
        >
          Sale
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
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

        <Button variant="outline" onClick={() => window.print()}>
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
                    Balance (₱)
                  </TableHead>
                  <TableHead className="text-center font-bold text-slate-900">
                    Packs
                  </TableHead>
                  <TableHead className="text-center font-bold text-slate-900">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No customer payment summary found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell className="text-center">
                        {row.customer}
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
                        {row.packs.toLocaleString()}
                      </TableCell>

                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          asChild
                        >
                          <Link href={`/payments/add?customerId=${row._id}`}>
                            Record Payment
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
                    <TableCell className="text-center">
                      {totals.packs.toLocaleString()}
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
