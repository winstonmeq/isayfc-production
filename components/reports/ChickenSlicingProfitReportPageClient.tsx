"use client";

import { useEffect, useState } from "react";
import { Loader2, Printer, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/app-shell/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { getReportPeriod, PrintReportHeader } from "./PrintReportHeader";

type ProductOption = {
  _id: string;
  name: string;
};

type ReportRow = {
  _id: string;
  batchId: string;
  date: string;
  mainProductId: string;
  mainProductName: string;
  slicedProductId: string;
  slicedProductName: string;
  heads: number;
  kilos: number;
  deliveryPrice: number;
  standardSlice: number;
  standardPacking: number;
  standardPcs: number;
  actualPcs: number;
  actualPacks: number;
  loosePcs: number;
  variance: number;
  pricePerPcs: number;
  pricePerPack: number;
  capital: number;
  gross: number;
  profit: number;
  slicer: string;
  packer: string;
};

type ReportSummary = {
  totalRows: number;
  totalHeads: number;
  totalKilos: number;
  totalStandardPcs: number;
  totalActualPcs: number;
  totalPacks: number;
  totalLoosePcs: number;
  totalCapital: number;
  totalGross: number;
  grossProfit: number;
  totalBodegaExpenses: number;
  netProfit: number;
  totalProfit: number;
};

type ReportFilters = {
  mainProducts: ProductOption[];
  slicedProducts: ProductOption[];
};

type LoadParams = {
  dateFrom?: string;
  dateTo?: string;
  mainProductId?: string;
  slicedProductId?: string;
  search?: string;
  limit?: string;
};

const emptySummary: ReportSummary = {
  totalRows: 0,
  totalHeads: 0,
  totalKilos: 0,
  totalStandardPcs: 0,
  totalActualPcs: 0,
  totalPacks: 0,
  totalLoosePcs: 0,
  totalCapital: 0,
  totalGross: 0,
  grossProfit: 0,
  totalBodegaExpenses: 0,
  netProfit: 0,
  totalProfit: 0,
};

function numberValue(value: string | number | undefined | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

function formatNumber(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numberValue(value));
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(value).toISOString().slice(0, 10);
}

export function ChickenSlicingProfitReportPageClient() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<ReportSummary>(emptySummary);
  const [filters, setFilters] = useState<ReportFilters>({
    mainProducts: [],
    slicedProducts: [],
  });

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mainProductId, setMainProductId] = useState("ALL");
  const [slicedProductId, setSlicedProductId] = useState("ALL");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState("5000");
  const [isLoading, setIsLoading] = useState(true);

  async function loadReport(overrides: LoadParams = {}) {
    setIsLoading(true);

    const nextDateFrom = overrides.dateFrom ?? dateFrom;
    const nextDateTo = overrides.dateTo ?? dateTo;
    const nextMainProductId = overrides.mainProductId ?? mainProductId;
    const nextSlicedProductId = overrides.slicedProductId ?? slicedProductId;
    const nextSearch = overrides.search ?? search;
    const nextLimit = overrides.limit ?? limit;

    const params = new URLSearchParams({
      limit: nextLimit,
    });

    if (nextDateFrom) params.set("dateFrom", nextDateFrom);
    if (nextDateTo) params.set("dateTo", nextDateTo);
    if (nextMainProductId !== "ALL") params.set("mainProductId", nextMainProductId);
    if (nextSlicedProductId !== "ALL") params.set("slicedProductId", nextSlicedProductId);
    if (nextSearch.trim()) params.set("search", nextSearch.trim());

    try {
      const res = await fetch(`/api/reports/chicken-slicing?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load chicken slicing report.");
      }

      setRows(json.data || []);
      setSummary(json.summary || emptySummary);
      setFilters(
        json.filters || {
          mainProducts: [],
          slicedProducts: [],
        }
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load chicken slicing report."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters() {
    void loadReport();
  }

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setMainProductId("ALL");
    setSlicedProductId("ALL");
    setSearch("");
    setLimit("5000");

    void loadReport({
      dateFrom: "",
      dateTo: "",
      mainProductId: "ALL",
      slicedProductId: "ALL",
      search: "",
      limit: "5000",
    });
  }

  return (
    <div className="space-y-5">
      <div className="no-print">
        <ModuleHeader
          title="Chicken Slicing Profit Report"
          actions={
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          }
        />
      </div>
      <PrintReportHeader
        title="Chicken Slicing Profit Report"
        period={getReportPeriod(dateFrom, dateTo)}
      />

      <Card className="rounded-2xl border-slate-200 shadow-sm print:hidden">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-7">
          <div>
            <Label>Date From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>

          <div>
            <Label>Date To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>

          <div>
            <Label>Size / Whole Chicken</Label>
            <Select value={mainProductId} onValueChange={setMainProductId}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {filters.mainProducts.map((product) => (
                  <SelectItem key={product._id} value={product._id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Sliced Product</Label>
            <Select value={slicedProductId} onValueChange={setSlicedProductId}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {filters.slicedProducts.map((product) => (
                  <SelectItem key={product._id} value={product._id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Search Product</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
              placeholder="OS1, C10, C59..."
            />
          </div>

          <div>
            <Label>Show</Label>
            <Select value={limit} onValueChange={setLimit}>
              <SelectTrigger>
                <SelectValue placeholder="Show" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1,000</SelectItem>
                <SelectItem value="5000">5,000</SelectItem>
                <SelectItem value="10000">10,000</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            <Button type="button" onClick={applyFilters} className="w-full">
              <Search className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Button type="button" variant="secondary" onClick={resetFilters}>
              <RefreshCcw className="h-4 w-4" />
              <span className="sr-only">Reset</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="border-b print:border-b-0">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <CardTitle>Results</CardTitle>
            <div className="text-sm text-muted-foreground">
              Total Rows: <span className="font-semibold text-foreground">{formatNumber(summary.totalRows)}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow>
                  <TableHead className="whitespace-nowrap text-white">Date</TableHead>
                  <TableHead className="whitespace-nowrap text-white">Size</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">Heads</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">Kilos</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">Delivery Price</TableHead>
                  <TableHead className="whitespace-nowrap text-white">Sliced Product</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">Std Slice</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">Std Pack</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">Actual PCS</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">No. of Packs</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">Loose PCS</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">Price / PCS</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">Price / Pack</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">Capital</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">Total Amount</TableHead>
                  <TableHead className="whitespace-nowrap text-right text-white">Gross Profit</TableHead>
                  <TableHead className="whitespace-nowrap text-white">Slicer / Packer</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={17} className="h-32 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={17} className="h-32 text-center text-muted-foreground">
                      No chicken slicing records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {rows.map((row) => (
                      <TableRow key={row._id}>
                        <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{row.mainProductName}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatNumber(row.heads)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatNumber(row.kilos, 2)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatMoney(row.deliveryPrice)}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.slicedProductName}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatNumber(row.standardSlice)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatNumber(row.standardPacking)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatNumber(row.actualPcs)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatNumber(row.actualPacks)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatNumber(row.loosePcs)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatMoney(row.pricePerPcs)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatMoney(row.pricePerPack)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatMoney(row.capital)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatMoney(row.gross)}</TableCell>
                        <TableCell
                          className={cn(
                            "whitespace-nowrap text-right font-semibold",
                            row.profit < 0 ? "text-red-600" : "text-emerald-700"
                          )}
                        >
                          {formatMoney(row.profit)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div>{row.slicer || "—"}</div>
                          <div className="text-xs text-muted-foreground">{row.packer || "—"}</div>
                        </TableCell>
                      </TableRow>
                    ))}

                    <TableRow className="bg-slate-100 font-bold">
                      <TableCell className="whitespace-nowrap">TOTAL</TableCell>
                      <TableCell />
                      <TableCell className="whitespace-nowrap text-right">{formatNumber(summary.totalHeads)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{formatNumber(summary.totalKilos, 2)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">—</TableCell>
                      <TableCell />
                      <TableCell className="whitespace-nowrap text-right">—</TableCell>
                      <TableCell className="whitespace-nowrap text-right">—</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{formatNumber(summary.totalActualPcs)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{formatNumber(summary.totalPacks)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{formatNumber(summary.totalLoosePcs)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">—</TableCell>
                      <TableCell className="whitespace-nowrap text-right">—</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{formatMoney(summary.totalCapital)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{formatMoney(summary.totalGross)}</TableCell>
                      <TableCell
                        className={cn(
                          "whitespace-nowrap text-right",
                          summary.grossProfit < 0 ? "text-red-600" : "text-emerald-700"
                        )}
                      >
                        {formatMoney(summary.grossProfit)}
                      </TableCell>
                      <TableCell />
                    </TableRow>

                    <TableRow className="bg-red-50 font-bold text-red-700">
                      <TableCell colSpan={15} className="whitespace-nowrap text-right">
                        Less: Bodega Expenses
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {formatMoney(summary.totalBodegaExpenses)}
                      </TableCell>
                      <TableCell />
                    </TableRow>

                    <TableRow className="bg-emerald-50 font-black">
                      <TableCell colSpan={15} className="whitespace-nowrap text-right">
                        NET PROFIT
                      </TableCell>
                      <TableCell
                        className={cn(
                          "whitespace-nowrap text-right",
                          summary.netProfit < 0 ? "text-red-600" : "text-emerald-700"
                        )}
                      >
                        {formatMoney(summary.netProfit)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
