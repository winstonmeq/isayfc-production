"use client";

import { useEffect, useState } from "react";
import { Loader2, Printer, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/app-shell/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getReportPeriod, PrintReportHeader } from "./PrintReportHeader";

type CategoryOption = {
  _id: string;
  name: string;
};

type ProductOption = {
  _id: string;
  name: string;
  categoryId: string;
  categoryName: string;
};

type ReportRow = {
  _id: string;
  saleId: string;
  receiptNumber: string;
  saleDate: string;
  customerName: string;
  categoryId: string;
  categoryName: string;
  productId: string;
  productName: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
  capital: number;
  totalAmount: number;
  grossProfit: number;
  remarks: string;
};

type ReportSummary = {
  totalRows: number;
  totalQty: number;
  totalCapital: number;
  totalGross: number;
  grossProfit: number;
  totalGroceryExpenses: number;
  netProfit: number;
  totalProfit: number;
};

type ReportFilters = {
  categories: CategoryOption[];
  products: ProductOption[];
};

type LoadParams = {
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  productId?: string;
  customer?: string;
  receiptNumber?: string;
  search?: string;
  limit?: string;
};

const emptySummary: ReportSummary = {
  totalRows: 0,
  totalQty: 0,
  totalCapital: 0,
  totalGross: 0,
  grossProfit: 0,
  totalGroceryExpenses: 0,
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

function profitClass(value: number) {
  if (value < 0) return "text-red-600";
  if (value > 0) return "text-emerald-700";
  return "text-slate-900";
}

export function ProductProfitRecoveryReportPageClient() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<ReportSummary>(emptySummary);
  const [filters, setFilters] = useState<ReportFilters>({
    categories: [],
    products: [],
  });

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryId, setCategoryId] = useState("ALL");
  const [productId, setProductId] = useState("ALL");
  const [customer, setCustomer] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState("5000");
  const [isLoading, setIsLoading] = useState(true);

  const filteredProducts =
    categoryId === "ALL"
      ? filters.products
      : filters.products.filter((product) => product.categoryId === categoryId);

  async function loadReport(overrides: LoadParams = {}) {
    setIsLoading(true);

    const nextDateFrom = overrides.dateFrom ?? dateFrom;
    const nextDateTo = overrides.dateTo ?? dateTo;
    const nextCategoryId = overrides.categoryId ?? categoryId;
    const nextProductId = overrides.productId ?? productId;
    const nextCustomer = overrides.customer ?? customer;
    const nextReceiptNumber = overrides.receiptNumber ?? receiptNumber;
    const nextSearch = overrides.search ?? search;
    const nextLimit = overrides.limit ?? limit;

    const params = new URLSearchParams({ limit: nextLimit });

    if (nextDateFrom) params.set("dateFrom", nextDateFrom);
    if (nextDateTo) params.set("dateTo", nextDateTo);
    if (nextCategoryId !== "ALL") params.set("categoryId", nextCategoryId);
    if (nextProductId !== "ALL") params.set("productId", nextProductId);
    if (nextCustomer.trim()) params.set("customer", nextCustomer.trim());
    if (nextReceiptNumber.trim()) params.set("receiptNumber", nextReceiptNumber.trim());
    if (nextSearch.trim()) params.set("search", nextSearch.trim());

    try {
      const res = await fetch(`/api/reports/product-profits?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load product profit report.");
      }

      setRows(json.data || []);
      setSummary(json.summary || emptySummary);
      setFilters(
        json.filters || {
          categories: [],
          products: [],
        }
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load product profit report."
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
    setCategoryId("ALL");
    setProductId("ALL");
    setCustomer("");
    setReceiptNumber("");
    setSearch("");
    setLimit("5000");

    void loadReport({
      dateFrom: "",
      dateTo: "",
      categoryId: "ALL",
      productId: "ALL",
      customer: "",
      receiptNumber: "",
      search: "",
      limit: "5000",
    });
  }

  function handleCategoryChange(value: string) {
    setCategoryId(value);
    setProductId("ALL");
  }

  return (
    <div className="space-y-5">
      <div className="no-print">
        <ModuleHeader
          title="Product Profit Recovery Report"
          actions={
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          }
        />
      </div>
      <PrintReportHeader
        title="Product Profit Recovery Report"
        period={getReportPeriod(dateFrom, dateTo)}
      />

      <Card className="rounded-2xl border-slate-200 shadow-sm print:hidden">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-8">
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
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={handleCategoryChange}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {filters.categories.map((category) => (
                  <SelectItem key={category._id} value={category._id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {filteredProducts.map((product) => (
                  <SelectItem key={product._id} value={product._id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Customer</Label>
            <Input
              value={customer}
              onChange={(event) => setCustomer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
              placeholder="Customer name"
            />
          </div>

          <div>
            <Label>Receipt #</Label>
            <Input
              value={receiptNumber}
              onChange={(event) => setReceiptNumber(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
              placeholder="Receipt"
            />
          </div>

          <div>
            <Label>Search</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
              placeholder="Product/category"
            />
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

          <div className="md:col-span-2 xl:col-span-1">
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
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Product Recovery Details</h2>
            <p className="text-sm text-muted-foreground">
              Gross profit is sales amount minus product capital. Net profit subtracts Grocery/Product expenses for the selected date range.
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow>
                  <TableHead className="text-white">Date</TableHead>
                  <TableHead className="text-white">Receipt #</TableHead>
                  <TableHead className="text-white">Customer</TableHead>
                  <TableHead className="text-white">Category</TableHead>
                  <TableHead className="text-white">Product</TableHead>
                  <TableHead className="text-right text-white">Qty</TableHead>
                  <TableHead className="text-right text-white">Cost / Unit</TableHead>
                  <TableHead className="text-right text-white">Price / Unit</TableHead>
                  <TableHead className="text-right text-white">Capital</TableHead>
                  <TableHead className="text-right text-white">Gross Sales</TableHead>
                  <TableHead className="text-right text-white">Gross Profit</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                      No product profit records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell>{formatDate(row.saleDate)}</TableCell>
                      <TableCell>{row.receiptNumber || "—"}</TableCell>
                      <TableCell>{row.customerName || "—"}</TableCell>
                      <TableCell>{row.categoryName || "NO CATEGORY"}</TableCell>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.qty)}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.unitCost)}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.unitPrice)}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.capital)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.totalAmount)}
                      </TableCell>
                      <TableCell className={cn("text-right font-semibold", profitClass(row.grossProfit))}>
                        {formatMoney(row.grossProfit)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>

              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="font-bold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {formatNumber(summary.totalQty)}
                  </TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right font-bold">
                    {formatMoney(summary.totalCapital)}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {formatMoney(summary.totalGross)}
                  </TableCell>
                  <TableCell className={cn("text-right font-bold", profitClass(summary.grossProfit))}>
                    {formatMoney(summary.grossProfit)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={10} className="text-right font-bold text-red-600">
                    Less: Grocery/Product Expenses
                  </TableCell>
                  <TableCell className="text-right font-bold text-red-600">
                    {formatMoney(summary.totalGroceryExpenses)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={10} className="text-right font-bold">
                    Net Profit
                  </TableCell>
                  <TableCell className={cn("text-right font-bold", profitClass(summary.netProfit))}>
                    {formatMoney(summary.netProfit)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
