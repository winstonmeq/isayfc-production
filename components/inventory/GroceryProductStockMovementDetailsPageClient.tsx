"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ProductSummary = {
  _id: string;
  name: string;
  categoryName: string;
  currentPcs: number;
  currentBags: number;
  currentKilos: number;
  lastUpdated?: string;
};

type MovementRow = {
  _id: string;
  date?: string;
  type: "IN" | "OUT" | "NONE";
  unit: "PCS" | "BAGS" | "KILOS";
  reference: string;
  qtyIn: number;
  qtyOut: number;
  previousStock: number;
  newStock: number;
  remarks: string;
};

export function GroceryProductStockMovementDetailsPageClient({
  productId,
}: {
  productId: string;
}) {
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: "",
    dateTo: "",
  });
  const [isLoading, setIsLoading] = useState(true);

  async function loadDetails() {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (appliedFilters.dateFrom) params.set("dateFrom", appliedFilters.dateFrom);
    if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);

    try {
      const response = await fetch(
        `/api/inventory/products/${productId}/movements?${params.toString()}`,
        { cache: "no-store" }
      );
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || "Failed to load stock movements.");
      }

      setProduct(json.product || null);
      setRows(json.data || []);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load stock movements."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, appliedFilters]);

  function formatNumber(value: number, decimals = 0) {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function formatDate(value?: string) {
    if (!value) return "-";
    return new Date(value).toISOString().slice(0, 10);
  }

  function movementNumber(value: number, unit: MovementRow["unit"]) {
    return formatNumber(value, unit === "KILOS" ? 2 : 0);
  }

  function applyFilters() {
    setAppliedFilters({ dateFrom, dateTo });
  }

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setAppliedFilters({ dateFrom: "", dateTo: "" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Grocery/Product Stock Movement Details
          </h1>
          <p className="text-sm text-muted-foreground">
            Complete inventory transaction history for one grocery product.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/inventory/products">Back</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Product
            </p>
            <p className="mt-1 text-lg font-bold">{product?.name || "-"}</p>
            <p className="text-xs text-muted-foreground">
              {product?.categoryName || "No category"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Current PCS
            </p>
            <p className="mt-1 text-lg font-bold">
              {formatNumber(product?.currentPcs || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Current Bags
            </p>
            <p className="mt-1 text-lg font-bold">
              {formatNumber(product?.currentBags || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Current Kilos
            </p>
            <p className="mt-1 text-lg font-bold">
              {formatNumber(product?.currentKilos || 0, 2)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-5 md:grid-cols-3">
          <div>
            <Label>Start Date</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div>
            <Label>End Date</Label>
            <Input
              type="date"
              min={dateFrom || undefined}
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={applyFilters}>Filter</Button>
            <Button variant="secondary" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow>
                  <TableHead className="text-white">#</TableHead>
                  <TableHead className="text-white">Date</TableHead>
                  <TableHead className="text-white">Type</TableHead>
                  <TableHead className="text-white">Unit</TableHead>
                  <TableHead className="text-white">Reference</TableHead>
                  <TableHead className="text-right text-white">Qty In</TableHead>
                  <TableHead className="text-right text-white">Qty Out</TableHead>
                  <TableHead className="text-right text-white">
                    Previous
                  </TableHead>
                  <TableHead className="text-right text-white">New</TableHead>
                  <TableHead className="text-white">Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No stock movement transactions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, index) => (
                    <TableRow key={row._id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell>
                        <span
                          className={
                            row.type === "IN"
                              ? "rounded bg-emerald-600 px-2 py-1 text-xs font-bold text-white"
                              : row.type === "OUT"
                                ? "rounded bg-rose-600 px-2 py-1 text-xs font-bold text-white"
                                : "rounded bg-slate-500 px-2 py-1 text-xs font-bold text-white"
                          }
                        >
                          {row.type}
                        </span>
                      </TableCell>
                      <TableCell>{row.unit}</TableCell>
                      <TableCell>{row.reference}</TableCell>
                      <TableCell className="text-right">
                        {row.qtyIn > 0
                          ? movementNumber(row.qtyIn, row.unit)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.qtyOut > 0
                          ? movementNumber(row.qtyOut, row.unit)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {movementNumber(row.previousStock, row.unit)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {movementNumber(row.newStock, row.unit)}
                      </TableCell>
                      <TableCell>{row.remarks || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
