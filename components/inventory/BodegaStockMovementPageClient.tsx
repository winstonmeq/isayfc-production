"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TablePagination } from "@/components/erp/TablePagination";
import { paginateTable } from "@/lib/table-pagination";
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

type BodegaMovementRow = {
  _id: string;
  product: string;
  stockIn: number;
  stockOut: number;
  currentStock: number;
  price: number;
  dateAdded?: string;
  isPackProduct?: boolean;
  packSize?: number;
  stockInPcs?: number;
  stockInPacks?: number;
  stockInLoosePcs?: number;
  stockOutPcs?: number;
  stockOutPacks?: number;
  stockOutLoosePcs?: number;
  currentStockPcs?: number;
  currentStockPacks?: number;
  currentStockLoosePcs?: number;
  pricePerPack?: number;
  pricePerPcs?: number;
  stockInBags?: number;
  stockOutBags?: number;
  stockInKilos?: number;
  stockOutKilos?: number;
  stockInHeads?: number;
  stockOutHeads?: number;
  currentBags?: number;
  currentKilos?: number;
  currentHeads?: number;
};

type BodegaTotals = {
  raw?: {
    stockIn: number;
    stockOut: number;
    currentStock: number;
  };
  sliced?: {
    stockInPcs: number;
    stockOutPcs: number;
    currentPcs: number;
  };
  whole?: {
    stockIn: number;
    stockOut: number;
    currentStock: number;
  };
};

export function BodegaStockMovementPageClient() {
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<BodegaMovementRow[]>([]);
  const [totals, setTotals] = useState<BodegaTotals>({
    raw: { stockIn: 0, stockOut: 0, currentStock: 0 },
    sliced: { stockInPcs: 0, stockOutPcs: 0, currentPcs: 0 },
    whole: { stockIn: 0, stockOut: 0, currentStock: 0 },
  });
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stockStatus, setStockStatus] = useState("ALL");
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    dateFrom: "",
    dateTo: "",
    stockStatus: "ALL",
  });
  const [isLoading, setIsLoading] = useState(true);

  async function loadData() {
    setIsLoading(true);

    const params = new URLSearchParams();
    if (appliedFilters.search) params.set("search", appliedFilters.search);
    if (appliedFilters.dateFrom) params.set("dateFrom", appliedFilters.dateFrom);
    if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);
    if (appliedFilters.stockStatus !== "ALL") {
      params.set("stockStatus", appliedFilters.stockStatus);
    }

    try {
      const res = await fetch(`/api/inventory/bodega?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load bodega stock movement.");
      }

      setRows(json.data || []);
      setTotals(
        json.totals || {
          raw: { stockIn: 0, stockOut: 0, currentStock: 0 },
          sliced: { stockInPcs: 0, stockOutPcs: 0, currentPcs: 0 },
          whole: { stockIn: 0, stockOut: 0, currentStock: 0 },
        }
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load bodega stock movement."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters({
      search: search.trim(),
      dateFrom,
      dateTo,
      stockStatus,
    });
  }

  function resetFilters() {
    setPage(1);
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setStockStatus("ALL");
    setAppliedFilters({
      search: "",
      dateFrom: "",
      dateTo: "",
      stockStatus: "ALL",
    });
  }

  function formatNumber(value: number | undefined, decimals = 2) {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function formatWholeNumber(value: number | undefined) {
    return Number(value || 0).toLocaleString(undefined, {
      maximumFractionDigits: 0,
    });
  }

  function formatDate(value?: string) {
    if (!value) return "-";
    return new Date(value).toISOString().slice(0, 10);
  }

  const pagination = paginateTable(rows, page, pageSize);
  const wholeRows = rows.filter((row) => !row.isPackProduct);
  const wholeTotal = (field: keyof BodegaMovementRow) =>
    wholeRows.reduce((sum, row) => sum + Number(row[field] || 0), 0);

  return (
    <div className="space-y-6">
      <Card className="gap-0 overflow-hidden rounded-lg border-slate-200 py-0 shadow-none">
        <CardContent className="grid items-end gap-3 p-4 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
          <div>
            <Label>Search Product</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="e.g. C10, OS1, SUPOT #1"
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
            />
          </div>

          <div>
            <Label>Stock Status</Label>
            <Select value={stockStatus} onValueChange={setStockStatus}>
              <SelectTrigger>
                <SelectValue placeholder="All Stock" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Stock</SelectItem>
                <SelectItem value="IN_STOCK">In Stock</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="OUT">Out</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>

          <div className="flex items-end gap-2">
            <Button onClick={applyFilters} className="flex-1">
              <Search className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Button variant="secondary" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden rounded-lg border-slate-200 py-0 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><h2 className="text-base font-semibold">Bodega Inventory <span className="font-normal text-slate-500">({rows.length} products)</span></h2><Button variant="outline" size="sm" asChild><Link href="/inventory-adjustments">Stock Corrections &amp; Returns</Link></Button></div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[1100px] text-sm [&_th]:text-center [&_td]:py-3">
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead rowSpan={2}>#</TableHead>
                  <TableHead rowSpan={2}>Product</TableHead>
                  <TableHead colSpan={3} className="bg-emerald-50 text-center text-emerald-900">IN</TableHead>
                  <TableHead colSpan={3} className="bg-rose-50 text-center text-rose-900">OUT</TableHead>
                  <TableHead colSpan={3} className="bg-blue-50 text-center text-blue-900">CURRENT</TableHead>
                  <TableHead rowSpan={2}>Updated</TableHead>
                  <TableHead rowSpan={2} className="text-center">Action</TableHead>
                </TableRow>
                <TableRow>
                  {["Heads / PCS", "Bags / Packs", "Kilos"].map((label) => (
                    <TableHead key={`in-${label}`} className="text-center">{label}</TableHead>
                  ))}
                  {["Heads / PCS", "Bags / Packs", "Kilos"].map((label) => (
                    <TableHead key={`out-${label}`} className="text-center">{label}</TableHead>
                  ))}
                  {["Heads / PCS", "Bags / Packs", "Kilos"].map((label) => (
                    <TableHead key={`current-${label}`} className="text-center">{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={13} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="h-32 text-center text-muted-foreground">
                      No bodega stock movement records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagination.rows.map((row, index) => (
                    <TableRow key={row._id}>
                      <TableCell>{pagination.from + index}</TableCell>
                      <TableCell className="font-medium">
                        {row.product}
                        {row.isPackProduct && row.packSize ? (
                          <div className="text-xs text-muted-foreground">{formatWholeNumber(row.packSize)} pcs/pack</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-center text-emerald-700">{formatWholeNumber(row.isPackProduct ? row.stockInPcs : row.stockInHeads || row.stockIn)}</TableCell>
                      <TableCell className="text-center text-emerald-700">{formatNumber(row.isPackProduct ? row.stockInPacks : row.stockInBags)}</TableCell>
                      <TableCell className="text-center text-emerald-700">{row.isPackProduct ? "—" : formatNumber(row.stockInKilos)}</TableCell>
                      <TableCell className="text-center text-rose-600">{formatWholeNumber(row.isPackProduct ? row.stockOutPcs : row.stockOutHeads || row.stockOut)}</TableCell>
                      <TableCell className="text-center text-rose-600">{formatNumber(row.isPackProduct ? row.stockOutPacks : row.stockOutBags)}</TableCell>
                      <TableCell className="text-center text-rose-600">{row.isPackProduct ? "—" : formatNumber(row.stockOutKilos)}</TableCell>
                      <TableCell className="text-center font-semibold">{formatWholeNumber(row.isPackProduct ? row.currentStockPcs : row.currentHeads || row.currentStock)}</TableCell>
                      <TableCell className="text-center font-semibold">{formatNumber(row.isPackProduct ? row.currentStockPacks : row.currentBags)}</TableCell>
                      <TableCell className="text-center font-semibold">{row.isPackProduct ? "—" : formatNumber(row.currentKilos)}</TableCell>
                      <TableCell>{formatDate(row.dateAdded)}</TableCell>
                      <TableCell className="text-center">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/inventory/bodega/${row._id}`}>
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {!isLoading && rows.length > 0 ? (
                  <>
                    <TableRow className="bg-slate-50 font-semibold">
                      <TableCell colSpan={2}>Filtered Total — Sliced Products</TableCell>
                      <TableCell className="text-center">{formatWholeNumber(totals.sliced?.stockInPcs)}</TableCell>
                      <TableCell className="text-center">Varies</TableCell><TableCell>—</TableCell>
                      <TableCell className="text-center">{formatWholeNumber(totals.sliced?.stockOutPcs)}</TableCell>
                      <TableCell className="text-center">Varies</TableCell><TableCell>—</TableCell>
                      <TableCell className="text-center">{formatWholeNumber(totals.sliced?.currentPcs)}</TableCell>
                      <TableCell className="text-center">Varies</TableCell><TableCell>—</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                    <TableRow className="bg-slate-50 font-semibold">
                      <TableCell colSpan={2}>Filtered Total — Whole / Other Products</TableCell>
                      <TableCell className="text-center">{formatWholeNumber(wholeTotal("stockInHeads"))}</TableCell>
                      <TableCell className="text-center">{formatNumber(wholeTotal("stockInBags"))}</TableCell>
                      <TableCell className="text-center">{formatNumber(wholeTotal("stockInKilos"))}</TableCell>
                      <TableCell className="text-center">{formatWholeNumber(wholeTotal("stockOutHeads"))}</TableCell>
                      <TableCell className="text-center">{formatNumber(wholeTotal("stockOutBags"))}</TableCell>
                      <TableCell className="text-center">{formatNumber(wholeTotal("stockOutKilos"))}</TableCell>
                      <TableCell className="text-center">{formatWholeNumber(wholeTotal("currentHeads"))}</TableCell>
                      <TableCell className="text-center">{formatNumber(wholeTotal("currentBags"))}</TableCell>
                      <TableCell className="text-center">{formatNumber(wholeTotal("currentKilos"))}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <TablePagination {...pagination} disabled={isLoading} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} />
      </Card>

    </div>
  );
}
