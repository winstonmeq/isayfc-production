"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ReportShell,
  buildRangeParams,
  type Preset,
} from "./ReportShell";

type ProductColumn = {
  key: string;
  productName: string;
  categoryName: string;
  source: string;
  packUnits: number;
  packRevenue: number;
  packPrice: number;
  pieceUnits: number;
  pieceRevenue: number;
  piecePrice: number;
  stockUnitsOut: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  beginningInventory: number;
  processedChickenCuts: number;
  endingInventory: number;
};

type ReportData = {
  range: { start: string; end: string };
  generatedAt: string;
  products: ProductColumn[];
  totals: {
    packUnits: number;
    packSales: number;
    pieceUnits: number;
    pieceSales: number;
    grossSales: number;
    discounts: number;
    netSales: number;
    beginningInventory: number;
    processedChickenCuts: number;
    endingInventory: number;
    productCogs: number;
    outletCogs: number;
    totalCogs: number;
    grossProfit: number;
    totalOperatingExpenses: number;
    netIncome: number;
    profitabilityRatio: number;
  };
  expenses: Array<{ type: string; name?: string; total: number }>;
};

const money = (value: number) =>
  (Number(value) || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const quantity = (value: number) =>
  (Number(value) || 0).toLocaleString("en-PH", {
    maximumFractionDigits: 2,
  });

export function GrossSalesProfitabilityReportPageClient() {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedProductKeys, setSelectedProductKeys] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const load = useCallback(async () => {
    if (preset === "custom" && (!from || !to)) {
      toast.error("Pick both a start and end date.");
      return;
    }
    setLoading(true);
    try {
      const params = buildRangeParams({ preset, from, to });
      const response = await fetch(
        `/api/reports/gross-sales?${params.toString()}`,
        { cache: "no-store" }
      );
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || "Failed to load gross sales report.");
      }
      const nextData = json as ReportData;
      setData(nextData);
      setSelectedProductKeys(
        nextData.products
          .filter(
            (product) =>
              product.grossSales !== 0 ||
              product.cogs !== 0 ||
              product.stockUnitsOut !== 0
          )
          .map((product) => product.key)
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load gross sales report."
      );
    } finally {
      setLoading(false);
    }
  }, [preset, from, to]);

  useEffect(() => {
    if (preset === "custom") return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [preset, load]);

  const availableProducts = useMemo(() => data?.products || [], [data]);

  const searchableProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return availableProducts;
    return availableProducts.filter((product) =>
      `${product.productName} ${product.categoryName} ${product.source}`
        .toLowerCase()
        .includes(query)
    );
  }, [availableProducts, productSearch]);

  const visibleProducts = useMemo(
    () =>
      availableProducts.filter((product) =>
        selectedProductKeys.includes(product.key)
      ),
    [availableProducts, selectedProductKeys]
  );

  const visibleTotals = useMemo(() => {
    if (!data) return undefined;
    // Product selection controls displayed columns only. Accounting totals
    // must continue to represent the complete period and must retain outlet
    // POS component COGS and all operating expenses.
    return data.totals;
  }, [data]);

  function toggleProduct(key: string, checked: boolean) {
    setSelectedProductKeys((current) =>
      checked
        ? [...new Set([...current, key])]
        : current.filter((item) => item !== key)
    );
  }

  const periodLabel = data
    ? `${new Date(data.range.start).toLocaleDateString("en-PH")} – ${new Date(
        new Date(data.range.end).getTime() - 1
      ).toLocaleDateString("en-PH")}`
    : undefined;

  return (
    <ReportShell
      title="Gross Sales, Cost of Sales & Income Statement"
      generatedAt={data?.generatedAt}
      periodLabel={periodLabel}
      preset={preset}
      from={from}
      to={to}
      onPreset={setPreset}
      onFrom={setFrom}
      onTo={setTo}
      onApply={load}
      extraFilters={
        <div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-56 justify-between font-normal">
                <span className="truncate">
                  Product Columns ({visibleProducts.length}/{availableProducts.length})
                </span>
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              <div className="border-b p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Search products..."
                    className="pl-9"
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setSelectedProductKeys((current) => [
                        ...new Set([
                          ...current,
                          ...availableProducts.map((product) => product.key),
                        ]),
                      ])
                    }
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const productKeys = new Set(
                        availableProducts.map((product) => product.key)
                      );
                      setSelectedProductKeys((current) =>
                        current.filter((key) => !productKeys.has(key))
                      );
                    }}
                  >
                    Clear All
                  </Button>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto p-2">
                {searchableProducts.length === 0 ? (
                  <p className="p-4 text-center text-sm text-slate-500">
                    No products found.
                  </p>
                ) : (
                  searchableProducts.map((product) => (
                    <label
                      key={product.key}
                      className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-slate-50"
                    >
                      <Checkbox
                        checked={selectedProductKeys.includes(product.key)}
                        onCheckedChange={(checked) =>
                          toggleProduct(product.key, checked === true)
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {product.productName}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {product.source === "CHICKEN"
                            ? "Chicken"
                            : product.categoryName}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      }
    >
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          .gross-sales-sheet { border: 0 !important; }
          .gross-sales-sheet table { font-size: 8px !important; line-height: 1.15; }
          .gross-sales-sheet th, .gross-sales-sheet td { padding: 2px 4px !important; }
          .gross-sales-sheet section { break-inside: avoid; }
        }
      `}</style>

      {loading ? (
        <div className="flex justify-center py-20 text-slate-400">
          <Loader2 className="size-7 animate-spin" />
        </div>
      ) : !data || !visibleTotals ? null : (
        <div className="gross-sales-sheet overflow-x-auto rounded-xl border border-slate-300 bg-white p-3 print:overflow-visible print:rounded-none print:p-0">
          <div className="space-y-5">
            <ReportTable products={visibleProducts}>
              <SectionTitle title="Gross Sales" products={visibleProducts} />
              <GroupLabel label="In Packs" products={visibleProducts} />
              <DataRow
                label="No. of Units Sold (packs)"
                total={quantity(visibleTotals.packUnits)}
                values={visibleProducts.map((product) => quantity(product.packUnits))}
              />
              <DataRow
                label="Average Price"
                total=""
                values={visibleProducts.map((product) =>
                  product.packUnits ? money(product.packPrice) : "—"
                )}
              />
              <DataRow
                label="Total Sales"
                total={money(visibleTotals.packSales)}
                values={visibleProducts.map((product) => money(product.packRevenue))}
                bold
                rule
              />

              <SpacerRow products={visibleProducts} />
              <GroupLabel label="In Pieces / Quantity" products={visibleProducts} />
              <DataRow
                label="No. of Units Sold"
                total={quantity(visibleTotals.pieceUnits)}
                values={visibleProducts.map((product) => quantity(product.pieceUnits))}
              />
              <DataRow
                label="Average Price"
                total=""
                values={visibleProducts.map((product) =>
                  product.pieceUnits ? money(product.piecePrice) : "—"
                )}
              />
              <DataRow
                label="Total Sales"
                total={money(visibleTotals.pieceSales)}
                values={visibleProducts.map((product) => money(product.pieceRevenue))}
                bold
              />
              <TotalBand
                label="OVERALL GROSS SALES"
                total={money(visibleTotals.grossSales)}
                products={visibleProducts}
              />
              <DataRow label="Less: Sales Discounts" total={money(visibleTotals.discounts)} values={visibleProducts.map((product) => money(product.discounts))} />
              <DataRow label="NET SALES" total={money(visibleTotals.netSales)} values={visibleProducts.map((product) => money(product.netSales))} bold rule />
            </ReportTable>

            <ReportTable products={visibleProducts}>
              <SectionTitle title="Cost of Sales" products={visibleProducts} />
              <GroupLabel label="In Stock Units" products={visibleProducts} />
              <DataRow
                label="Beginning Inventory"
                total={quantity(visibleTotals.beginningInventory)}
                values={visibleProducts.map((product) =>
                  product.source === "CHICKEN"
                    ? quantity(product.beginningInventory)
                    : "—"
                )}
              />
              <DataRow
                label="Add: Processed Chicken Cuts"
                total={quantity(visibleTotals.processedChickenCuts)}
                values={visibleProducts.map((product) =>
                  product.source === "CHICKEN"
                    ? quantity(product.processedChickenCuts)
                    : "—"
                )}
              />
              <DataRow
                label="Less: Ending Inventory"
                total={quantity(visibleTotals.endingInventory)}
                values={visibleProducts.map((product) =>
                  product.source === "CHICKEN"
                    ? quantity(product.endingInventory)
                    : "—"
                )}
              />
              <DataRow
                label="Inventory Units Released (Sold)"
                total={quantity(visibleProducts.reduce((sum, product) => sum + product.stockUnitsOut, 0))}
                values={visibleProducts.map((product) => quantity(product.stockUnitsOut))}
                bold
                rule
              />
              <SpacerRow products={visibleProducts} />
              <GroupLabel label="In Peso" products={visibleProducts} />
              <DataRow
                label="Historical Product Cost from Sales Ledger"
                total={money(visibleTotals.productCogs)}
                values={visibleProducts.map((product) => money(product.cogs))}
                bold
              />
              {visibleTotals.outletCogs > 0 ? (
                <DataRow
                  label="Outlet POS Component Cost from Stock Ledger"
                  total={money(visibleTotals.outletCogs)}
                  values={visibleProducts.map(() => "—")}
                />
              ) : null}
              <DataRow
                label="TOTAL COST OF SALES"
                total={money(visibleTotals.totalCogs)}
                values={visibleProducts.map((product) => money(product.cogs))}
                bold
                rule
              />
              <ProfitRow
                label="GROSS PROFIT"
                total={visibleTotals.grossProfit}
                values={visibleProducts.map((product) => product.grossProfit)}
              />
            </ReportTable>

            <table className="w-full table-fixed border-collapse border border-black text-xs">
              <tbody>
                <tr>
                  <th className="border-b border-black px-1 py-1 text-left" colSpan={2}>
                    Operating Expenses
                  </th>
                </tr>
                {data.expenses.map((expense) => (
                  <tr key={expense.type}>
                    <td className="w-80 px-1 py-1 italic">
                      {expense.name || expense.type.replaceAll("_", " ")}
                    </td>
                    <td className="px-1 py-1 text-right">{money(expense.total)}</td>
                  </tr>
                ))}
                <tr className="border-t border-black font-bold">
                  <td className="px-1 py-1">Total Operating Expenses</td>
                  <td className="px-1 py-1 text-right">
                    {money(visibleTotals.totalOperatingExpenses)}
                  </td>
                </tr>
                <tr className="border-t border-black font-black">
                  <td className="px-1 py-1">NET INCOME</td>
                  <td className={summaryValueClass(visibleTotals.netIncome)}>
                    {signedMoney(visibleTotals.netIncome)}
                  </td>
                </tr>
                <tr className="border-t border-black font-black">
                  <td className="px-1 py-1">PROFITABILITY RATIO</td>
                  <td className={summaryValueClass(visibleTotals.profitabilityRatio)}>
                    {visibleTotals.profitabilityRatio.toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ReportShell>
  );
}

function ReportTable({
  products,
  children,
}: {
  products: ProductColumn[];
  children: React.ReactNode;
}) {
  return (
    <table className="w-max min-w-full table-fixed border-collapse border border-black text-xs">
      <colgroup>
        <col className="w-52" />
        <col className="w-24" />
        {products.map((product) => (
          <col key={product.key} className="w-24" />
        ))}
      </colgroup>
      <tbody>{children}</tbody>
    </table>
  );
}

function SectionTitle({ title, products }: { title: string; products: ProductColumn[] }) {
  return (
    <>
      <tr>
        <th className="px-1 py-1 text-left text-sm" colSpan={2}>
          {title}
        </th>
        {products.length > 0 ? (
          <th className="px-1 py-1 text-center text-sm" colSpan={products.length}>
            PRODUCT
          </th>
        ) : null}
      </tr>
      <tr className="border-b border-black">
        <th className="px-1 py-1 text-left" />
        <th className="px-1 py-1 text-center">TOTAL</th>
        {products.map((product) => (
          <th key={product.key} className="px-1 py-1 text-center">
            <span className="block truncate">{product.productName}</span>
            <span className="block text-[9px] font-normal text-slate-500">
              {product.source === "CHICKEN" ? "Chicken" : product.categoryName}
            </span>
          </th>
        ))}
      </tr>
    </>
  );
}

function GroupLabel({ label, products }: { label: string; products: ProductColumn[] }) {
  return (
    <tr>
      <th className="px-1 pt-2 text-left" colSpan={products.length + 2}>{label}</th>
    </tr>
  );
}

function DataRow({
  label,
  total,
  values,
  bold,
  rule,
}: {
  label: string;
  total: string;
  values: string[];
  bold?: boolean;
  rule?: boolean;
}) {
  return (
    <tr className={`${bold ? "font-bold" : ""} ${rule ? "border-b border-black" : ""}`}>
      <td className="px-1 py-1">{label}</td>
      <td className="px-1 py-1 text-center tabular-nums">{total}</td>
      {values.map((value, index) => (
        <td key={index} className="px-1 py-1 text-center tabular-nums">{value}</td>
      ))}
    </tr>
  );
}

function SpacerRow({ products }: { products: ProductColumn[] }) {
  return <tr><td className="h-3" colSpan={products.length + 2} /></tr>;
}

function TotalBand({ label, total, products }: { label: string; total: string; products: ProductColumn[] }) {
  return (
    <tr className="bg-black font-black text-white">
      <td className="px-1 py-2">{label}</td>
      <td className="px-1 py-2 text-center tabular-nums">{total}</td>
      {products.length > 0 ? <td colSpan={products.length} /> : null}
    </tr>
  );
}

function signedMoney(value: number) {
  return value < 0 ? `(${money(Math.abs(value))})` : money(value);
}

function valueClass(value: number) {
  return `px-1 py-1 text-center tabular-nums ${value < 0 ? "text-red-600" : "text-slate-950"}`;
}

function summaryValueClass(value: number) {
  return `px-1 py-1 text-right tabular-nums ${value < 0 ? "text-red-600" : "text-slate-950"}`;
}

function ProfitRow({ label, total, values }: { label: string; total: number; values: number[] }) {
  return (
    <tr className="border-t border-b border-black font-black">
      <td className="px-1 py-1">{label}</td>
      <td className={valueClass(total)}>{signedMoney(total)}</td>
      {values.map((value, index) => (
        <td key={index} className={valueClass(value)}>{signedMoney(value)}</td>
      ))}
    </tr>
  );
}
