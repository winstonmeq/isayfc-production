"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  cogs: number;
  grossProfit: number;
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
    productCogs: number;
    outletCogs: number;
    totalCogs: number;
    grossProfit: number;
    totalOperatingExpenses: number;
    netIncome: number;
    profitabilityRatio: number;
  };
  expenses: Array<{ type: string; total: number }>;
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

const expenseLabel: Record<string, string> = {
  DELIVERY_EXPENSES: "Delivery Expenses",
  CLEANING_SUPPLIES: "Cleaning Supplies",
  TRANSPORTATION_EXPENSES: "Transportation Expense",
  MARINATE_EXPENSES: "Marinate Expense",
  OFFICE_SUPPLIES: "Office Supplies",
  REPAIR_AND_MAINTENANCE: "Repairs and Maintenance",
  SALARIES: "Salaries Expense",
  INCENTIVES_AND_ALLOWANCES: "Incentives and Allowances",
  OTHERS: "Other Expenses",
};

export function GrossSalesProfitabilityReportPageClient() {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

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
      setData(json as ReportData);
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

  const periodLabel = data
    ? `${new Date(data.range.start).toLocaleDateString("en-PH")} – ${new Date(
        new Date(data.range.end).getTime() - 1
      ).toLocaleDateString("en-PH")}`
    : undefined;

  return (
    <ReportShell
      title="Gross Sales & Profitability Report"
      subtitle="Gross sales, historical cost of sales, operating expenses, and net income by product."
      generatedAt={data?.generatedAt}
      periodLabel={periodLabel}
      preset={preset}
      from={from}
      to={to}
      onPreset={setPreset}
      onFrom={setFrom}
      onTo={setTo}
      onApply={load}
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
      ) : !data ? null : (
        <div className="gross-sales-sheet overflow-x-auto rounded-xl border border-slate-300 bg-white p-3 print:overflow-visible print:rounded-none print:p-0">
          <div className="min-w-max space-y-5">
            <ReportTable products={data.products}>
              <SectionTitle title="Gross Sales" products={data.products} />
              <GroupLabel label="In Packs" products={data.products} />
              <DataRow
                label="No. of Units Sold (packs)"
                total={quantity(data.totals.packUnits)}
                values={data.products.map((product) => quantity(product.packUnits))}
              />
              <DataRow
                label="Average Price"
                total=""
                values={data.products.map((product) =>
                  product.packUnits ? money(product.packPrice) : "—"
                )}
              />
              <DataRow
                label="Total Sales"
                total={money(data.totals.packSales)}
                values={data.products.map((product) => money(product.packRevenue))}
                bold
                rule
              />

              <SpacerRow products={data.products} />
              <GroupLabel label="In Pieces / Quantity" products={data.products} />
              <DataRow
                label="No. of Units Sold"
                total={quantity(data.totals.pieceUnits)}
                values={data.products.map((product) => quantity(product.pieceUnits))}
              />
              <DataRow
                label="Average Price"
                total=""
                values={data.products.map((product) =>
                  product.pieceUnits ? money(product.piecePrice) : "—"
                )}
              />
              <DataRow
                label="Total Sales"
                total={money(data.totals.pieceSales)}
                values={data.products.map((product) => money(product.pieceRevenue))}
                bold
              />
              <TotalBand
                label="OVERALL GROSS SALES"
                total={money(data.totals.grossSales)}
                products={data.products}
              />
            </ReportTable>

            <ReportTable products={data.products}>
              <SectionTitle title="Cost of Sales" products={data.products} />
              <GroupLabel label="In Stock Units" products={data.products} />
              <DataRow
                label="Units Released from Inventory"
                total={quantity(
                  data.products.reduce(
                    (sum, product) => sum + product.stockUnitsOut,
                    0
                  )
                )}
                values={data.products.map((product) =>
                  quantity(product.stockUnitsOut)
                )}
              />
              <SpacerRow products={data.products} />
              <GroupLabel label="In Peso" products={data.products} />
              <DataRow
                label="Historical Product Cost"
                total={money(data.totals.productCogs)}
                values={data.products.map((product) => money(product.cogs))}
                bold
              />
              {data.totals.outletCogs > 0 ? (
                <DataRow
                  label="Outlet POS Component Cost"
                  total={money(data.totals.outletCogs)}
                  values={data.products.map(() => "—")}
                />
              ) : null}
              <DataRow
                label="TOTAL COST OF SALES"
                total={money(data.totals.totalCogs)}
                values={data.products.map((product) => money(product.cogs))}
                bold
                rule
              />
              <ProfitRow
                label="GROSS PROFIT"
                total={data.totals.grossProfit}
                values={data.products.map((product) => product.grossProfit)}
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
                      {expenseLabel[expense.type] || expense.type.replaceAll("_", " ")}
                    </td>
                    <td className="px-1 py-1 text-right">{money(expense.total)}</td>
                  </tr>
                ))}
                <tr className="border-t border-black font-bold">
                  <td className="px-1 py-1">Total Operating Expenses</td>
                  <td className="px-1 py-1 text-right">
                    {money(data.totals.totalOperatingExpenses)}
                  </td>
                </tr>
                <tr className="border-t border-black font-black">
                  <td className="px-1 py-1">NET INCOME</td>
                  <td className={valueClass(data.totals.netIncome)}>
                    {signedMoney(data.totals.netIncome)}
                  </td>
                </tr>
                <tr className="border-t border-black font-black">
                  <td className="px-1 py-1">PROFITABILITY RATIO</td>
                  <td className={valueClass(data.totals.profitabilityRatio)}>
                    {data.totals.profitabilityRatio.toFixed(2)}%
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
    <table className="w-full table-fixed border-collapse border border-black text-xs">
      <colgroup>
        <col className="w-64" />
        <col className="w-28" />
        {products.map((product) => (
          <col key={product.key} className="w-28" />
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
        <th className="px-1 py-1 text-left text-sm" colSpan={2}>{title}</th>
        <th className="px-1 py-1 text-center text-sm" colSpan={Math.max(products.length, 1)}>
          PRODUCT
        </th>
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
      <td className="px-1 py-1 text-right">{total}</td>
      {values.map((value, index) => (
        <td key={index} className="px-1 py-1 text-right">{value}</td>
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
      <td className="px-1 py-2 text-right">{total}</td>
      <td colSpan={products.length} />
    </tr>
  );
}

function signedMoney(value: number) {
  return value < 0 ? `(${money(Math.abs(value))})` : money(value);
}

function valueClass(value: number) {
  return `px-1 py-1 text-right ${value < 0 ? "text-red-600" : "text-slate-950"}`;
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
