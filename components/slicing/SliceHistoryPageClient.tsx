"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  PlusCircle,
  Printer,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  ErpEmptyState,
  ErpField,
  ErpKeyValue,
  ErpMobileCard,
  ErpPage,
  ErpPageHeader,
  ErpSection,
  ErpToolbar,
} from "@/components/erp/ErpShell";
import { formatDecimal, formatWholeNumber, numberValue } from "@/components/erp/StockDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getSlicingVariance } from "@/lib/slicing-validation";

type ProductOption = {
  _id: string;
  name: string;
};

type SlicingHistoryItem = {
  _id: string;
  batchId?: string;
  mainProductName: string;
  slicedProductName: string;
  qtyToSlice: number;
  heads?: number;
  actualSlicedPcs: number;
  standardSlice?: number;
  standardPacking: number;
  totalStdPcs?: number;
  actualPacks: number;
  butal?: number;
  variance: number;
  kilos: number;
  bags: number;
  slicingDate?: string;
  slicer?: string;
  packer?: string;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toISOString().slice(0, 10);
}

function formatPercent(value: number) {
  return `${numberValue(value).toFixed(2)}%`;
}

function formatSignedWholeNumber(value: unknown) {
  return Math.trunc(numberValue(value)).toLocaleString();
}

function getStdPcs(record: SlicingHistoryItem) {
  const existing = numberValue(record.totalStdPcs);
  if (existing > 0) return existing;
  const heads = numberValue(record.heads ?? record.qtyToSlice);
  const standardSlice = numberValue(record.standardSlice);
  return heads * standardSlice;
}

function getLoosePcs(record: SlicingHistoryItem) {
  if (typeof record.butal !== "undefined") return Math.max(0, Math.trunc(numberValue(record.butal)));
  const actualPcs = Math.max(0, Math.trunc(numberValue(record.actualSlicedPcs)));
  const packSize = Math.max(0, Math.trunc(numberValue(record.standardPacking)));
  if (packSize <= 0) return actualPcs;
  return actualPcs % packSize;
}

function getYieldRate(record: SlicingHistoryItem) {
  const stdPcs = getStdPcs(record);
  if (stdPcs <= 0) return 0;
  return (numberValue(record.actualSlicedPcs) / stdPcs) * 100;
}

function getVariance(record: SlicingHistoryItem) {
  return getSlicingVariance(record.actualSlicedPcs, getStdPcs(record));
}

export function SliceHistoryPageClient() {
  const [records, setRecords] = useState<SlicingHistoryItem[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [meta, setMeta] = useState<ApiMeta>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState("50");
  const [slicedProductId, setSlicedProductId] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    slicedProductId: "ALL",
    dateFrom: "",
    dateTo: "",
  });
  const [isLoading, setIsLoading] = useState(true);

  const tableTotals = useMemo(() => {
    const totals = records.reduce(
      (sum, record) => ({
        heads: sum.heads + numberValue(record.heads ?? record.qtyToSlice),
        bags: sum.bags + numberValue(record.bags),
        kilos: sum.kilos + numberValue(record.kilos),
        stdPcs: sum.stdPcs + getStdPcs(record),
        actualPcs: sum.actualPcs + numberValue(record.actualSlicedPcs),
        packs: sum.packs + numberValue(record.actualPacks),
        loosePcs: sum.loosePcs + getLoosePcs(record),
        variance: sum.variance + getVariance(record),
      }),
      {
        heads: 0,
        bags: 0,
        kilos: 0,
        stdPcs: 0,
        actualPcs: 0,
        packs: 0,
        loosePcs: 0,
        variance: 0,
      }
    );

    return {
      ...totals,
      yieldRate: totals.stdPcs > 0 ? (totals.actualPcs / totals.stdPcs) * 100 : 0,
    };
  }, [records]);

  async function loadProducts() {
    try {
      const res = await fetch("/api/bodega-products?limit=1000", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.success) setProducts(json.data || []);
    } catch {
      toast.error("Failed to load bodega products.");
    }
  }

  async function loadRecords() {
    setIsLoading(true);

    const params = new URLSearchParams({ page: String(page), limit });
    if (appliedFilters.slicedProductId !== "ALL") params.set("slicedProductId", appliedFilters.slicedProductId);
    if (appliedFilters.dateFrom) params.set("dateFrom", appliedFilters.dateFrom);
    if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);

    try {
      const res = await fetch(`/api/slicing?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load slicing records.");
      }

      setRecords(json.data || []);
      setMeta(json.meta || { page, limit: Number(limit), total: 0, totalPages: 1 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load slicing records.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  useEffect(() => {
    void loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, appliedFilters]);

  async function handleDelete(record: SlicingHistoryItem) {
    const batchId = record.batchId || record._id;
    const confirmed = window.confirm("Are you sure you want to void this slicing batch?");
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/slicing/${batchId}`, { method: "DELETE" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to void slicing batch.");
      }

      toast.success(json.message || "Slicing batch voided successfully.");
      await loadRecords();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to void slicing batch.");
    }
  }

  function applyFilters() {
    setAppliedFilters({ slicedProductId, dateFrom, dateTo });
    setPage(1);
  }

  function resetFilters() {
    setSlicedProductId("ALL");
    setDateFrom("");
    setDateTo("");
    setAppliedFilters({ slicedProductId: "ALL", dateFrom: "", dateTo: "" });
    setPage(1);
  }

  return (
    <ErpPage>
      <ErpPageHeader
        title="Slicing History"
        actions={
          <>
            <Button asChild>
              <Link href="/slicing/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Slicing
              </Link>
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </>
        }
      />

      <ErpToolbar>
        <ErpField label="Rows">
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
        </ErpField>
        <ErpField label="Sliced Product">
          <Select value={slicedProductId} onValueChange={setSlicedProductId}>
            <SelectTrigger>
              <SelectValue placeholder="All products" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Products</SelectItem>
              {products.map((product) => (
                <SelectItem key={product._id} value={product._id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ErpField>
        <ErpField label="Date From">
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </ErpField>
        <ErpField label="Date To">
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </ErpField>
        <div className="flex items-end gap-2">
          <Button onClick={applyFilters} className="flex-1">
            <Search className="mr-2 h-4 w-4" />
            Filter
          </Button>
          <Button variant="secondary" onClick={resetFilters} className="flex-1">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>
      </ErpToolbar>

      <ErpSection title="Slicing Transactions">
        {isLoading ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
          </div>
        ) : records.length === 0 ? (
          <ErpEmptyState title="No slicing records found" description="Try changing your filters or add a new slicing transaction." />
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow>
                    <TableHead className="text-white">Date</TableHead>
                    <TableHead className="text-white">Whole Chicken</TableHead>
                    <TableHead className="text-white">Sliced Product</TableHead>
                    <TableHead className="text-right text-white">Heads</TableHead>
                    <TableHead className="text-right text-white">Bags</TableHead>
                    <TableHead className="text-right text-white">Kilos</TableHead>
                    <TableHead className="text-right text-white">Std PCS</TableHead>
                    <TableHead className="text-right text-white">Actual PCS</TableHead>
                    <TableHead className="text-right text-white">Pack Size</TableHead>
                    <TableHead className="text-right text-white">Full Packs / Loose</TableHead>
                    <TableHead className="text-right text-white">Yield</TableHead>
                    <TableHead className="text-right text-white">Variance</TableHead>
                    <TableHead className="text-white">Staff</TableHead>
                    <TableHead className="text-center text-white">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => {
                    const stdPcs = getStdPcs(record);
                    const loosePcs = getLoosePcs(record);
                    const yieldRate = getYieldRate(record);
                    const variance = getVariance(record);
                    return (
                      <TableRow key={record._id}>
                        <TableCell>{formatDate(record.slicingDate)}</TableCell>
                        <TableCell className="font-bold text-slate-950">{record.mainProductName}</TableCell>
                        <TableCell>{record.slicedProductName}</TableCell>
                        <TableCell className="text-right">{formatWholeNumber(record.heads ?? record.qtyToSlice)}</TableCell>
                        <TableCell className="text-right">{formatWholeNumber(record.bags)}</TableCell>
                        <TableCell className="text-right">{formatDecimal(record.kilos, 2)}</TableCell>
                        <TableCell className="text-right">{formatWholeNumber(stdPcs)}</TableCell>
                        <TableCell className="text-right font-bold">{formatWholeNumber(record.actualSlicedPcs)}</TableCell>
                        <TableCell className="text-right">{formatWholeNumber(record.standardPacking)} pcs</TableCell>
                        <TableCell className="text-right">
                          {formatWholeNumber(record.actualPacks)} packs / {formatWholeNumber(loosePcs)} pcs
                        </TableCell>
                        <TableCell className="text-right">{formatPercent(yieldRate)}</TableCell>
                        <TableCell className={cn("text-right font-bold", variance < 0 ? "text-red-600" : variance > 0 ? "text-emerald-700" : "text-slate-700")}>
                          {formatSignedWholeNumber(variance)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{record.slicer || "-"}</div>
                            <div className="text-slate-500">{record.packer || "-"}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(record)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                            Void
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter className="bg-slate-100 font-bold text-slate-950">
                  <TableRow>
                    <TableCell>Page Total</TableCell>
                    <TableCell>—</TableCell>
                    <TableCell>—</TableCell>
                    <TableCell className="text-right">{formatWholeNumber(tableTotals.heads)}</TableCell>
                    <TableCell className="text-right">{formatWholeNumber(tableTotals.bags)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(tableTotals.kilos, 2)}</TableCell>
                    <TableCell className="text-right">{formatWholeNumber(tableTotals.stdPcs)}</TableCell>
                    <TableCell className="text-right">{formatWholeNumber(tableTotals.actualPcs)}</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">
                      {formatWholeNumber(tableTotals.packs)} packs / {formatWholeNumber(tableTotals.loosePcs)} pcs
                    </TableCell>
                    <TableCell className="text-right">{formatPercent(tableTotals.yieldRate)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right",
                        tableTotals.variance < 0
                          ? "text-red-600"
                          : tableTotals.variance > 0
                            ? "text-emerald-700"
                            : "text-slate-700"
                      )}
                    >
                      {formatSignedWholeNumber(tableTotals.variance)}
                    </TableCell>
                    <TableCell>—</TableCell>
                    <TableCell className="text-center">—</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <div className="space-y-3 lg:hidden">
              {records.map((record) => {
                const stdPcs = getStdPcs(record);
                const loosePcs = getLoosePcs(record);
                const yieldRate = getYieldRate(record);
                const variance = getVariance(record);
                return (
                  <ErpMobileCard key={record._id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{formatDate(record.slicingDate)}</p>
                        <h3 className="mt-1 font-black text-slate-950">{record.mainProductName} to {record.slicedProductName}</h3>
                      </div>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(record)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                        Void
                      </Button>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <ErpKeyValue label="Heads" value={formatWholeNumber(record.heads ?? record.qtyToSlice)} />
                      <ErpKeyValue label="Bags" value={formatWholeNumber(record.bags)} />
                      <ErpKeyValue label="Kilos" value={formatDecimal(record.kilos, 2)} />
                      <ErpKeyValue label="Std PCS" value={formatWholeNumber(stdPcs)} />
                      <ErpKeyValue label="Actual PCS" value={formatWholeNumber(record.actualSlicedPcs)} />
                      <ErpKeyValue label="Packs / Loose" value={`${formatWholeNumber(record.actualPacks)} / ${formatWholeNumber(loosePcs)}`} />
                      <ErpKeyValue label="Yield" value={formatPercent(yieldRate)} />
                      <ErpKeyValue label="Variance" value={<span className={variance < 0 ? "text-red-600" : "text-emerald-700"}>{formatSignedWholeNumber(variance)}</span>} />
                      <ErpKeyValue label="Staff" value={`${record.slicer || "-"} / ${record.packer || "-"}`} />
                    </div>
                  </ErpMobileCard>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <div>
            Showing <span className="font-bold text-slate-900">{records.length}</span> of <span className="font-bold text-slate-900">{meta.total}</span> records
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => Math.max(current - 1, 1))}>
              Previous
            </Button>
            <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button variant="outline" disabled={page >= meta.totalPages || isLoading} onClick={() => setPage((current) => Math.min(current + 1, meta.totalPages))}>
              Next
            </Button>
          </div>
        </div>
      </ErpSection>
    </ErpPage>
  );
}
