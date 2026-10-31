"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

type CategoryOption = {
  _id: string;
  name: string;
};

type ProductOption = {
  _id: string;
  name: string;
  categoryName: string;
};

type SaleLineItem = {
  _id: string;
  saleId?: string;
  receiptNumber?: string;
  saleDate?: string;
  customerName?: string;
  source?: "OUTLET" | "CHICKEN" | "GROCERY" | "CHICKEN + GROCERY" | string;
  outletCode?: string;
  outletName?: string;
  inventorySource?: "CHICKEN" | "BODEGA" | string;
  categoryName?: string;
  productName?: string;
  qty?: number;
  price?: number;
  lineTotal?: number;
  discountAmount?: number;
  discountName?: string;
  remarks?: string;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type Summary = {
  rows: number;
  totalQty: number;
  totalPrice: number;
  totalDiscount?: number;
  totalAmount: number;
};

type AppliedFilters = {
  dateFrom: string;
  dateTo: string;
  receiptNumber: string;
  customer: string;
  source: string;
  categoryNames: string;
  productNames: string;
};

function getCategoryName(item: any) {
  return (
    item.categoryName ||
    item.categoryId?.name ||
    item.category?.name ||
    "NO CATEGORY"
  );
}

function getProductName(item: any) {
  return item.name || item.productName || "Unnamed Product";
}

const emptyFilters: AppliedFilters = {
  dateFrom: "",
  dateTo: "",
  receiptNumber: "",
  customer: "",
  source: "ALL",
  categoryNames: "",
  productNames: "",
};

export function SalesLinesPageClient() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [lines, setLines] = useState<SaleLineItem[]>([]);

  const [summary, setSummary] = useState<Summary>({
    rows: 0,
    totalQty: 0,
    totalPrice: 0,
    totalAmount: 0,
  });

  const [meta, setMeta] = useState<ApiMeta>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });

  const [page, setPage] = useState(1);
  const [limit] = useState("50");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [source, setSource] = useState("ALL");

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const [appliedFilters, setAppliedFilters] =
    useState<AppliedFilters>(emptyFilters);

  const [isLoading, setIsLoading] = useState(true);

  const filteredProducts = useMemo(() => {
    if (selectedCategories.length === 0) {
      return products;
    }

    return products.filter((product) =>
      selectedCategories.includes(product.categoryName)
    );
  }, [products, selectedCategories]);

  async function loadFilterOptions() {
    try {
      const [categoriesRes, productsRes, bodegaProductsRes] = await Promise.all([
        fetch("/api/categories?limit=1000", { cache: "no-store" }),
        fetch("/api/products?limit=1000", { cache: "no-store" }),
        fetch("/api/bodega-products?limit=1000", { cache: "no-store" }),
      ]);

      const [categoriesJson, productsJson, bodegaProductsJson] =
        await Promise.all([
          categoriesRes.json(),
          productsRes.json(),
          bodegaProductsRes.json(),
        ]);

      const categoryMap = new Map<string, CategoryOption>();
      const productMap = new Map<string, ProductOption>();

      if (categoriesRes.ok && categoriesJson.success) {
        for (const item of categoriesJson.data || []) {
          if (!item.name) continue;

          categoryMap.set(item.name, {
            _id: item._id || item.name,
            name: item.name,
          });
        }
      }

      if (productsRes.ok && productsJson.success) {
        for (const item of productsJson.data || []) {
          const name = getProductName(item);
          const categoryName = getCategoryName(item);

          categoryMap.set(categoryName, {
            _id: categoryName,
            name: categoryName,
          });

          productMap.set(`PRODUCT-${item._id}`, {
            _id: item._id,
            name,
            categoryName,
          });
        }
      }

      if (bodegaProductsRes.ok && bodegaProductsJson.success) {
        for (const item of bodegaProductsJson.data || []) {
          const name = getProductName(item);
          const categoryName = getCategoryName(item);

          categoryMap.set(categoryName, {
            _id: categoryName,
            name: categoryName,
          });

          productMap.set(`BODEGA-${item._id}`, {
            _id: item._id,
            name,
            categoryName,
          });
        }
      }

      setCategories(
        Array.from(categoryMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );

      setProducts(
        Array.from(productMap.values()).sort((a, b) => {
          if (a.categoryName === b.categoryName) {
            return a.name.localeCompare(b.name);
          }

          return a.categoryName.localeCompare(b.categoryName);
        })
      );
    } catch {
      toast.error("Failed to load filter options.");
    }
  }

  async function loadLines(filters: AppliedFilters, targetPage: number) {
    setIsLoading(true);

    const params = new URLSearchParams({
      page: String(targetPage),
      limit,
    });

    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);

    if (filters.receiptNumber) {
      params.set("receiptNumber", filters.receiptNumber);
    }

    if (filters.customer) {
      params.set("customer", filters.customer);
    }

    if (filters.source && filters.source !== "ALL") {
      params.set("source", filters.source);
    }

    if (filters.categoryNames) {
      params.set("categoryNames", filters.categoryNames);
    }

    if (filters.productNames) {
      params.set("productNames", filters.productNames);
    }

    try {
      const res = await fetch(`/api/sales/lines?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load sales lines.");
      }

      setLines(json.data || []);
      setSummary(
        json.summary || {
          rows: 0,
          totalQty: 0,
          totalPrice: 0,
          totalAmount: 0,
        }
      );
      setMeta(
        json.meta || {
          page: targetPage,
          limit: Number(limit),
          total: 0,
          totalPages: 1,
        }
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load sales lines."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadFilterOptions();
    void loadLines(emptyFilters, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadLines(appliedFilters, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function toggleCategory(name: string) {
    setSelectedCategories((current) => {
      const nextCategories = current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name];

      setSelectedProducts((currentProducts) => {
        if (nextCategories.length === 0) {
          return currentProducts;
        }

        const allowedProductNames = products
          .filter((product) => nextCategories.includes(product.categoryName))
          .map((product) => product.name);

        return currentProducts.filter((productName) =>
          allowedProductNames.includes(productName)
        );
      });

      return nextCategories;
    });
  }

  function toggleProduct(name: string) {
    setSelectedProducts((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    );
  }

  function applyFilters() {
    const nextFilters: AppliedFilters = {
      dateFrom,
      dateTo,
      receiptNumber: receiptNumber.trim(),
      customer: customer.trim(),
      source,
      categoryNames: selectedCategories.join(","),
      productNames: selectedProducts.join(","),
    };

    setAppliedFilters(nextFilters);
    setPage(1);

    void loadLines(nextFilters, 1);
  }

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setReceiptNumber("");
    setCustomer("");
    setSource("ALL");
    setSelectedCategories([]);
    setSelectedProducts([]);

    setAppliedFilters(emptyFilters);
    setPage(1);

    void loadLines(emptyFilters, 1);
  }

  function formatDate(value?: string) {
    if (!value) return "—";
    return new Date(value).toISOString().slice(0, 10);
  }

  function displaySaleId(line: SaleLineItem) {
    if (line.saleId) return line.saleId.slice(-6);
    if (line._id) return line._id.slice(-6);
    return "—";
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
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
              <Label>Receipt Number</Label>
              <Input
                value={receiptNumber}
                onChange={(event) => setReceiptNumber(event.target.value)}
                placeholder="e.g. 2631"
              />
            </div>

            <div className="space-y-2">
              <Label>Customer</Label>
              <Input
                value={customer}
                onChange={(event) => setCustomer(event.target.value)}
                placeholder="Customer name"
              />
            </div>

            <div className="space-y-2">
              <Label>Sale Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="OUTLET">Outlet</SelectItem>
                  <SelectItem value="CHICKEN">Chicken</SelectItem>
                  <SelectItem value="GROCERY">Grocery</SelectItem>
                  <SelectItem value="MIXED">Chicken + Grocery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={resetFilters}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => window.print()}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Category</Label>

            <div className="max-h-36 overflow-auto rounded-lg border p-3">
              {categories.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No categories found.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {categories.map((category) => (
                    <label
                      key={category._id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedCategories.includes(category.name)}
                        onCheckedChange={() => toggleCategory(category.name)}
                      />
                      {category.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Select category to filter product choices. Leave unchecked to
              include all categories.
            </p>
          </div>

          <div className="space-y-2">
            <Label>
              Product Name{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({filteredProducts.length} products)
              </span>
            </Label>

            <div className="max-h-64 overflow-auto rounded-lg border p-3">
              {filteredProducts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No products found.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {filteredProducts.map((product) => (
                    <label
                      key={`${product._id}-${product.name}-${product.categoryName}`}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedProducts.includes(product.name)}
                        onCheckedChange={() => toggleProduct(product.name)}
                      />

                      <span className="leading-tight">
                        <span className="block font-medium">
                          {product.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {product.categoryName}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Leave unchecked to include all products.
            </p>
          </div>

          <Button onClick={applyFilters}>
            <Search className="mr-2 h-4 w-4" />
            Apply Filters
          </Button>

          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-md bg-blue-600 px-3 py-2 font-bold text-white">
              Rows: {summary.rows.toLocaleString()}
            </span>

            <span className="rounded-md bg-emerald-700 px-3 py-2 font-bold text-white">
              Total: {formatPeso(summary.totalAmount)}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-slate-900">
                <TableRow>
                  <TableHead className="text-white">Sale ID</TableHead>
                  <TableHead className="text-white">Receipt #</TableHead>
                  <TableHead className="text-white">Date</TableHead>
                  <TableHead className="text-white">Customer</TableHead>
                  <TableHead className="text-white">Sale Source</TableHead>
                  <TableHead className="text-white">Outlet</TableHead>
                  <TableHead className="text-white">Inventory Source</TableHead>
                  <TableHead className="text-white">Category</TableHead>
                  <TableHead className="text-white">Product</TableHead>
                  <TableHead className="text-right text-white">Qty</TableHead>
                  <TableHead className="text-right text-white">Price</TableHead>
                  <TableHead className="text-right text-white">Discount</TableHead>
                  <TableHead className="text-right text-white">
                    Line Total
                  </TableHead>
                  <TableHead className="text-white">Remarks</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={14} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : lines.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={14}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No sales lines found.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {lines.map((line) => (
                      <TableRow key={line._id}>
                      <TableCell>{displaySaleId(line)}</TableCell>
                      <TableCell>{line.receiptNumber || "—"}</TableCell>
                      <TableCell>{formatDate(line.saleDate)}</TableCell>
                      <TableCell>{line.customerName || "—"}</TableCell>
                      <TableCell>
                        <span className="rounded bg-emerald-700 px-2 py-1 text-xs font-bold text-white">
                          {line.source || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {line.outletCode || line.outletName || "—"}
                      </TableCell>
                      <TableCell>
                        {line.inventorySource === "BODEGA"
                          ? "GROCERY"
                          : line.inventorySource || "—"}
                      </TableCell>
                      <TableCell>{line.categoryName || "—"}</TableCell>
                      <TableCell>{line.productName || "—"}</TableCell>
                      <TableCell className="text-right">
                        {Number(line.qty || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPeso(Number(line.price || 0))}
                      </TableCell>
                      <TableCell className="text-right">{line.discountName && <span className="block text-xs text-slate-500">{line.discountName}</span>}{formatPeso(Number(line.discountAmount || 0))}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatPeso(Number(line.lineTotal || 0))}
                      </TableCell>
                      <TableCell>{line.remarks || "—"}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 bg-slate-100 font-bold hover:bg-slate-100">
                      <TableCell colSpan={9}>TOTAL ({summary.rows})</TableCell>
                      <TableCell className="text-right">
                        {Number(summary.totalQty || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPeso(Number(summary.totalPrice || 0))}
                      </TableCell>
                      <TableCell className="text-right">{formatPeso(Number(summary.totalDiscount || 0))}</TableCell>
                      <TableCell className="text-right">
                        {formatPeso(Number(summary.totalAmount || 0))}
                      </TableCell>
                      <TableCell>—</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {lines.length} of {meta.total} records
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
              >
                Previous
              </Button>

              <span className="rounded-md border px-3 py-2">
                Page {meta.page} of {meta.totalPages}
              </span>

              <Button
                variant="outline"
                disabled={page >= meta.totalPages || isLoading}
                onClick={() =>
                  setPage((current) => Math.min(current + 1, meta.totalPages))
                }
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
