"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Loader2,
  PlusCircle,
  Printer,
  RefreshCcw,
  Search,
  Scissors,
} from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/app-shell/ModuleHeader";
import { Badge } from "@/components/ui/badge";
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

type ProductOption = {
  _id: string;
  name: string;
};

type DailySlicingProduct = {
  mainProductName: string;
  slicedProductName: string;
  standardSlice: number;
  standardPacking: number;
  batchCount: number;
  activityCount: number;
  bags: number;
  heads: number;
  kilos: number;
  totalStdPcs: number;
  actualSlicedPcs: number;
  actualPacks: number;
  butal: number;
  variance: number;
  yieldRate: number;
};

type DailySlicingRecord = {
  _id: string;
  date: string;
  slicingDate: string;
  transactionName: string;
  batchCount: number;
  activityCount: number;
  productCount: number;
  bags: number;
  heads: number;
  kilos: number;
  totalStdPcs: number;
  actualSlicedPcs: number;
  actualPacks: number;
  butal: number;
  variance: number;
  yieldRate: number;
  slicers: string[];
  packers: string[];
  products: DailySlicingProduct[];
};

type DailySummary = {
  dayCount: number;
  batchCount: number;
  activityCount: number;
  productCount: number;
  bags: number;
  heads: number;
  kilos: number;
  totalStdPcs: number;
  actualSlicedPcs: number;
  actualPacks: number;
  butal: number;
  variance: number;
  yieldRate: number;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function wholeNumber(value: unknown) {
  return Math.max(0, Math.trunc(numberValue(value)));
}

function formatWhole(value: unknown) {
  return wholeNumber(value).toLocaleString();
}

function formatDecimal(value: unknown, digits = 2) {
  return numberValue(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: unknown) {
  return `${formatDecimal(value, 2)}%`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatNames(names: string[]) {
  if (!names || names.length === 0) return "-";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function varianceTone(variance: number) {
  if (variance < 0) return "destructive";
  if (variance > 0) return "secondary";
  return "outline";
}

function varianceLabel(variance: number) {
  if (variance < 0) return "Short";
  if (variance > 0) return "Over";
  return "Exact";
}

const emptySummary: DailySummary = {
  dayCount: 0,
  batchCount: 0,
  activityCount: 0,
  productCount: 0,
  bags: 0,
  heads: 0,
  kilos: 0,
  totalStdPcs: 0,
  actualSlicedPcs: 0,
  actualPacks: 0,
  butal: 0,
  variance: 0,
  yieldRate: 0,
};

export function DailySlicingHistoryPageClient() {
  const today = todayString();
  const [records, setRecords] = useState<DailySlicingRecord[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [summary, setSummary] = useState<DailySummary>(emptySummary);
  const [meta, setMeta] = useState<ApiMeta>({ page: 1, limit: 31, total: 0, totalPages: 1 });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState("31");
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [slicedProductId, setSlicedProductId] = useState("ALL");
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: today,
    dateTo: today,
    slicedProductId: "ALL",
  });
  const [isLoading, setIsLoading] = useState(true);

  const ownerNote = useMemo(() => {
    if (appliedFilters.dateFrom === appliedFilters.dateTo) {
      return `Showing all slicing activities added together for ${formatDate(appliedFilters.dateFrom)}.`;
    }
    return `Showing one summarized row per day from ${formatDate(appliedFilters.dateFrom)} to ${formatDate(appliedFilters.dateTo)}.`;
  }, [appliedFilters]);

  async function loadRecords() {
    setIsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit,
      dateFrom: appliedFilters.dateFrom,
      dateTo: appliedFilters.dateTo,
    });

    if (appliedFilters.slicedProductId !== "ALL") {
      params.set("slicedProductId", appliedFilters.slicedProductId);
    }

    try {
      const res = await fetch(`/api/slicing/daily-history?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load daily slicing history.");
      }

      const nextRecords = Array.isArray(json.data) ? json.data : [];
      setRecords(nextRecords);
      setSummary(json.summary || emptySummary);
      setMeta(json.meta || { page, limit: Number(limit), total: 0, totalPages: 1 });

      if (Array.isArray(json.products)) {
        setProducts(json.products);
      }

      setExpanded((current) => {
        const next: Record<string, boolean> = { ...current };
        for (const record of nextRecords) {
          if (typeof next[record._id] === "undefined") next[record._id] = true;
        }
        return next;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load daily slicing history.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, appliedFilters]);

  function applyFilters() {
    if (!dateFrom || !dateTo) {
      toast.error("Date begin and date end are required.");
      return;
    }

    if (dateFrom > dateTo) {
      toast.error("Date begin cannot be after date end.");
      return;
    }

    setAppliedFilters({ dateFrom, dateTo, slicedProductId });
    setPage(1);
  }

  function resetFilters() {
    const today = todayString();
    setDateFrom(today);
    setDateTo(today);
    setSlicedProductId("ALL");
    setAppliedFilters({ dateFrom: today, dateTo: today, slicedProductId: "ALL" });
    setPage(1);
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Operations"
        title="Daily Slicing History"
        description="Owner-friendly daily view. All slicing activities in the same day are combined into one transaction summary."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/slicing/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Slicing
              </Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        }
      />

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="grid gap-4 p-4 md:grid-cols-5">
          <div className="space-y-2">
            <Label>Date Begin</Label>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Date End</Label>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Sliced Product</Label>
            <Select value={slicedProductId} onValueChange={setSlicedProductId}>
              <SelectTrigger>
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All sliced products</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product._id} value={product._id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" className="flex-1" onClick={applyFilters}>
              <Search className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Button type="button" variant="secondary" onClick={resetFilters}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>


      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="gap-1 border-b bg-slate-50/70">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5 text-slate-500" />
                One-Day Transaction Summary
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{ownerNote}</p>
            </div>
            <Select
              value={limit}
              onValueChange={(value) => {
                setLimit(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Rows" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 days</SelectItem>
                <SelectItem value="31">31 days</SelectItem>
                <SelectItem value="50">50 days</SelectItem>
                <SelectItem value="100">100 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-56 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
              <Scissors className="h-10 w-10 text-slate-300" />
              <div>
                <p className="font-semibold text-slate-900">No slicing activity found</p>
                <p className="text-sm text-muted-foreground">Try changing the date range or product filter.</p>
              </div>
              <Button asChild variant="outline">
                <Link href="/slicing/new">Add slicing record</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-950 hover:bg-slate-950">
                      <TableHead className="min-w-[170px] text-white">Date / Transaction</TableHead>
                      <TableHead className="text-right text-white">Batches</TableHead>
                      <TableHead className="text-right text-white">Heads</TableHead>
                      <TableHead className="text-right text-white">Kilos</TableHead>
                      <TableHead className="text-right text-white">Std PCS</TableHead>
                      <TableHead className="text-right text-white">Actual PCS</TableHead>
                      <TableHead className="text-right text-white">Packs</TableHead>
                      <TableHead className="text-right text-white">Loose PCS</TableHead>
                      <TableHead className="text-right text-white">Variance</TableHead>
                      <TableHead className="text-right text-white">Yield</TableHead>
                      <TableHead className="min-w-[170px] text-white">Staff</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <Fragment key={record._id}>
                        <TableRow key={record._id} className="bg-white">
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => toggleExpanded(record._id)}
                              className="flex items-start gap-2 text-left"
                            >
                              {expanded[record._id] ? (
                                <ChevronDown className="mt-0.5 h-4 w-4 text-slate-500" />
                              ) : (
                                <ChevronRight className="mt-0.5 h-4 w-4 text-slate-500" />
                              )}
                              <span>
                                <span className="block font-semibold text-slate-950">{formatDate(record.slicingDate)}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {formatWhole(record.productCount)} products / {formatWhole(record.activityCount)} activities
                                </span>
                              </span>
                            </button>
                          </TableCell>
                          <TableCell className="text-right">{formatWhole(record.batchCount)}</TableCell>
                          <TableCell className="text-right">{formatWhole(record.heads)}</TableCell>
                          <TableCell className="text-right">{formatDecimal(record.kilos)}</TableCell>
                          <TableCell className="text-right">{formatWhole(record.totalStdPcs)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatWhole(record.actualSlicedPcs)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatWhole(record.actualPacks)}</TableCell>
                          <TableCell className="text-right">{formatWhole(record.butal)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={varianceTone(record.variance)}>
                              {record.variance > 0 ? "+" : ""}{formatWhole(Math.abs(record.variance))} {varianceLabel(record.variance)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatPercent(record.yieldRate)}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <p><span className="text-muted-foreground">Slicer:</span> {formatNames(record.slicers)}</p>
                              <p><span className="text-muted-foreground">Packer:</span> {formatNames(record.packers)}</p>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expanded[record._id] ? (
                          <TableRow key={`${record._id}-details`} className="bg-slate-50/70 hover:bg-slate-50/70">
                            <TableCell colSpan={11} className="p-4">
                              <div className="overflow-hidden rounded-xl border bg-white">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Whole Chicken</TableHead>
                                      <TableHead>Sliced Product</TableHead>
                                      <TableHead className="text-right">Std Slice</TableHead>
                                      <TableHead className="text-right">Pack Size</TableHead>
                                      <TableHead className="text-right">Heads</TableHead>
                                      <TableHead className="text-right">Std PCS</TableHead>
                                      <TableHead className="text-right">Actual PCS</TableHead>
                                      <TableHead className="text-right">Packs</TableHead>
                                      <TableHead className="text-right">Loose</TableHead>
                                      <TableHead className="text-right">Variance</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {record.products.map((product, index) => (
                                      <TableRow key={`${record._id}-${product.slicedProductName}-${index}`}>
                                        <TableCell>{product.mainProductName}</TableCell>
                                        <TableCell className="font-medium">{product.slicedProductName}</TableCell>
                                        <TableCell className="text-right">{formatWhole(product.standardSlice)} pcs/head</TableCell>
                                        <TableCell className="text-right">{formatWhole(product.standardPacking)} pcs/pack</TableCell>
                                        <TableCell className="text-right">{formatWhole(product.heads)}</TableCell>
                                        <TableCell className="text-right">{formatWhole(product.totalStdPcs)}</TableCell>
                                        <TableCell className="text-right font-semibold">{formatWhole(product.actualSlicedPcs)}</TableCell>
                                        <TableCell className="text-right font-semibold">{formatWhole(product.actualPacks)}</TableCell>
                                        <TableCell className="text-right">{formatWhole(product.butal)}</TableCell>
                                        <TableCell className="text-right">
                                          <span className={cn(product.variance < 0 ? "text-red-600" : product.variance > 0 ? "text-emerald-700" : "text-slate-700")}>
                                            {product.variance > 0 ? "+" : ""}{formatWhole(Math.abs(product.variance))}
                                          </span>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    ))}
                    <TableRow className="bg-slate-100 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{formatWhole(summary.batchCount)}</TableCell>
                      <TableCell className="text-right">{formatWhole(summary.heads)}</TableCell>
                      <TableCell className="text-right">{formatDecimal(summary.kilos)}</TableCell>
                      <TableCell className="text-right">{formatWhole(summary.totalStdPcs)}</TableCell>
                      <TableCell className="text-right">{formatWhole(summary.actualSlicedPcs)}</TableCell>
                      <TableCell className="text-right">{formatWhole(summary.actualPacks)}</TableCell>
                      <TableCell className="text-right">{formatWhole(summary.butal)}</TableCell>
                      <TableCell className="text-right">{summary.variance > 0 ? "+" : ""}{formatWhole(Math.abs(summary.variance))}</TableCell>
                      <TableCell className="text-right">{formatPercent(summary.yieldRate)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 p-4 lg:hidden">
                {records.map((record) => (
                  <div key={record._id} className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{formatDate(record.slicingDate)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatWhole(record.batchCount)} batches / {formatWhole(record.productCount)} products
                        </p>
                      </div>
                      <Badge variant={varianceTone(record.variance)}>{varianceLabel(record.variance)}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Heads</p>
                        <p className="font-semibold">{formatWhole(record.heads)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Kilos</p>
                        <p className="font-semibold">{formatDecimal(record.kilos)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Actual PCS</p>
                        <p className="font-semibold">{formatWhole(record.actualSlicedPcs)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Packed</p>
                        <p className="font-semibold">{formatWhole(record.actualPacks)} packs / {formatWhole(record.butal)} loose</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Variance</p>
                        <p className="font-semibold">{record.variance > 0 ? "+" : ""}{formatWhole(Math.abs(record.variance))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Yield</p>
                        <p className="font-semibold">{formatPercent(record.yieldRate)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(record._id)}
                      className="mt-4 flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium"
                    >
                      Product details
                      {expanded[record._id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {expanded[record._id] ? (
                      <div className="mt-3 space-y-2">
                        {record.products.map((product, index) => (
                          <div key={`${record._id}-mobile-${index}`} className="rounded-xl border p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold">{product.slicedProductName}</p>
                              <p className="text-xs text-muted-foreground">{product.standardPacking} pcs/pack</p>
                            </div>
                            <p className="text-xs text-muted-foreground">From {product.mainProductName}</p>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <p>Heads: <span className="font-medium">{formatWhole(product.heads)}</span></p>
                              <p>Std: <span className="font-medium">{formatWhole(product.totalStdPcs)}</span></p>
                              <p>Actual: <span className="font-medium">{formatWhole(product.actualSlicedPcs)}</span></p>
                              <p>Packs: <span className="font-medium">{formatWhole(product.actualPacks)}</span></p>
                              <p>Loose: <span className="font-medium">{formatWhole(product.butal)}</span></p>
                              <p>Var: <span className="font-medium">{product.variance > 0 ? "+" : ""}{formatWhole(Math.abs(product.variance))}</span></p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {records.length.toLocaleString()} of {meta.total.toLocaleString()} daily records.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={page >= meta.totalPages || isLoading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
