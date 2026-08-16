"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";

function LoadingModule() {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-3xl border border-slate-200 bg-white">
      <div className="text-center">
        <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-blue-600" />
        <p className="mt-3 text-sm font-bold text-slate-600">Opening module…</p>
      </div>
    </div>
  );
}

const moduleComponents: Record<string, ComponentType> = {
  "/customers": dynamic(
    () =>
      import("@/components/app-shell/MasterDataModules").then(
        (m) => m.CustomersModule
      ),
    { loading: LoadingModule }
  ),
  "/suppliers": dynamic(
    () =>
      import("@/components/app-shell/MasterDataModules").then(
        (m) => m.SuppliersModule
      ),
    { loading: LoadingModule }
  ),
  "/categories": dynamic(
    () =>
      import("@/components/app-shell/MasterDataModules").then(
        (m) => m.CategoriesModule
      ),
    { loading: LoadingModule }
  ),
  "/outlets": dynamic(
    () => import("@/components/outlets/OutletsPageClient").then((m) => m.OutletsPageClient),
    { loading: LoadingModule }
  ),
  "/outlet-menu": dynamic(
    () => import("@/components/outlets/OutletMenuPageClient").then((m) => m.OutletMenuPageClient),
    { loading: LoadingModule }
  ),
  "/stock-transfers": dynamic(
    () =>
      import("@/components/stock-transfers/StockTransfersPageClient").then(
        (m) => m.StockTransfersPageClient
      ),
    { loading: LoadingModule }
  ),
  "/products": dynamic(
    () => import("@/components/products/ProductsPageClient").then((m) => m.ProductsPageClient),
    { loading: LoadingModule }
  ),
  "/bodega-products": dynamic(
    () =>
      import("@/components/bodega-products/BodegaProductsPageClient").then(
        (m) => m.BodegaProductsPageClient
      ),
    { loading: LoadingModule }
  ),
  "/purchase-items": dynamic(
    () =>
      import("@/components/purchase-items/PurchaseBatchesPageClient").then(
        (m) => m.PurchaseBatchesPageClient
      ),
    { loading: LoadingModule }
  ),
  "/deliveries": dynamic(
    () =>
      import("@/components/deliveries/DeliveriesPageClient").then(
        (m) => m.DeliveriesPageClient
      ),
    { loading: LoadingModule }
  ),
  "/slicing": dynamic(
    () =>
      import("@/components/slicing/SliceHistoryPageClient").then(
        (m) => m.SliceHistoryPageClient
      ),
    { loading: LoadingModule }
  ),
  "/slicing/new": dynamic(
    () =>
      import("@/components/slicing/AddSlicingPageClient").then(
        (m) => m.AddSlicingPageClient
      ),
    { loading: LoadingModule }
  ),
  "/slicing/daily-history": dynamic(
    () =>
      import("@/components/slicing/DailySlicingHistoryPageClient").then(
        (m) => m.DailySlicingHistoryPageClient
      ),
    { loading: LoadingModule }
  ),
  "/slicing/standard-packing": dynamic(
    () =>
      import("@/components/slicing/StandardPackingPageClient").then(
        (m) => m.StandardPackingPageClient
      ),
    { loading: LoadingModule }
  ),
  "/sales": dynamic(
    () => import("@/components/sales/SellChickenPageClient").then((m) => m.SellChickenPageClient),
    { loading: LoadingModule }
  ),
  "/sales/all": dynamic(
    () => import("@/components/sales/AllSalesPageClient").then((m) => m.AllSalesPageClient),
    { loading: LoadingModule }
  ),
  "/sales/grocery": dynamic(
    () => import("@/components/sales/SaleGroceryPageClient").then((m) => m.SaleGroceryPageClient),
    { loading: LoadingModule }
  ),
  "/sales/history": dynamic(
    () => import("@/components/sales/SalesHistoryPageClient").then((m) => m.SalesHistoryPageClient),
    { loading: LoadingModule }
  ),
  "/sales/lines": dynamic(
    () => import("@/components/sales/SalesLinesPageClient").then((m) => m.SalesLinesPageClient),
    { loading: LoadingModule }
  ),
  "/payments": dynamic(
    () =>
      import("@/components/payments/PaymentSummaryPageClient").then(
        (m) => m.PaymentSummaryPageClient
      ),
    { loading: LoadingModule }
  ),
  "/payments/pos-collections": dynamic(
    () =>
      import("@/components/payments/PosCollectionsPageClient").then(
        (m) => m.PosCollectionsPageClient
      ),
    { loading: LoadingModule }
  ),
  "/payments/add": dynamic(
    () =>
      import("@/components/payments/RecordPaymentPageClient").then(
        (m) => m.RecordPaymentPageClient
      ),
    { loading: LoadingModule }
  ),
  "/payments/history": dynamic(
    () =>
      import("@/components/payments/PaymentSummaryPageClient").then(
        (m) => m.PaymentSummaryPageClient
      ),
    { loading: LoadingModule }
  ),
  "/outlet-summary": dynamic(
    () =>
      import("@/components/outlets/OutletSummaryPageClient").then(
        (m) => m.OutletSummaryPageClient
      ),
    { loading: LoadingModule }
  ),
  "/profit/chicken-slicing": dynamic(
    () =>
      import("@/components/reports/ChickenSlicingProfitReportPageClient").then(
        (m) => m.ChickenSlicingProfitReportPageClient
      ),
    { loading: LoadingModule }
  ),
  "/profit/products": dynamic(
    () =>
      import("@/components/reports/ProductProfitRecoveryReportPageClient").then(
        (m) => m.ProductProfitRecoveryReportPageClient
      ),
    { loading: LoadingModule }
  ),
  "/expenses-bodega": dynamic(
    () =>
      import("@/components/expenses/ExpensesBodegaPageClient").then(
        (m) => m.ExpensesBodegaPageClient
      ),
    { loading: LoadingModule }
  ),
  "/outlet-inventory": dynamic(
    () =>
      import("@/components/outlets/OutletInventoryPageClient").then(
        (m) => m.OutletInventoryPageClient
      ),
    { loading: LoadingModule }
  ),
  "/inventory/products": dynamic(
    () =>
      import("@/components/inventory/ProductInventoryPageClient").then(
        (m) => m.ProductInventoryPageClient
      ),
    { loading: LoadingModule }
  ),
  "/inventory/whole-chicken": dynamic(
    () =>
      import("@/components/inventory/WholeChickenMovementPageClient").then(
        (m) => m.WholeChickenMovementPageClient
      ),
    { loading: LoadingModule }
  ),
  "/inventory/bodega": dynamic(
    () =>
      import("@/components/inventory/BodegaStockMovementPageClient").then(
        (m) => m.BodegaStockMovementPageClient
      ),
    { loading: LoadingModule }
  ),
  "/reports/sales": dynamic(
    () =>
      import("@/components/reports/SalesReportPageClient").then(
        (m) => m.SalesReportPageClient
      ),
    { loading: LoadingModule }
  ),
  "/reports/gross-sales": dynamic(
    () =>
      import("@/components/reports/GrossSalesProfitabilityReportPageClient").then(
        (m) => m.GrossSalesProfitabilityReportPageClient
      ),
    { loading: LoadingModule }
  ),
  "/reports/inventory": dynamic(
    () =>
      import("@/components/reports/InventoryReportPageClient").then(
        (m) => m.InventoryReportPageClient
      ),
    { loading: LoadingModule }
  ),
  "/reports/inventory-movements": dynamic(
    () =>
      import("@/components/reports/InventoryMovementReportPageClient").then(
        (m) => m.InventoryMovementReportPageClient
      ),
    { loading: LoadingModule }
  ),
  "/reports/inventory-reconciliation": dynamic(
    () =>
      import("@/components/reports/InventoryReconciliationReportPageClient").then(
        (m) => m.InventoryReconciliationReportPageClient
      ),
    { loading: LoadingModule }
  ),
  "/reports/payments": dynamic(
    () =>
      import("@/components/reports/PaymentsReportPageClient").then(
        (m) => m.PaymentsReportPageClient
      ),
    { loading: LoadingModule }
  ),
  "/reports/profit": dynamic(
    () =>
      import("@/components/reports/ProfitReportPageClient").then(
        (m) => m.ProfitReportPageClient
      ),
    { loading: LoadingModule }
  ),
  "/reports/product-profits": dynamic(
    () =>
      import("@/components/reports/ProductProfitRecoveryReportPageClient").then(
        (m) => m.ProductProfitRecoveryReportPageClient
      ),
    { loading: LoadingModule }
  ),
  "/users": dynamic(
    () => import("@/components/users/UsersPageClient").then((m) => m.UsersPageClient),
    { loading: LoadingModule }
  ),
  "/roles": dynamic(
    () => import("@/components/roles/RolesPageClient").then((m) => m.RolesPageClient),
    { loading: LoadingModule }
  ),
  "/audit-logs": dynamic(
    () => import("@/components/audit-logs/AuditLogsPageClient").then((m) => m.AuditLogsPageClient),
    { loading: LoadingModule }
  ),
  "/corrections": dynamic(
    () =>
      import("@/components/corrections/CorrectionRegisterPageClient").then(
        (m) => m.CorrectionRegisterPageClient
      ),
    { loading: LoadingModule }
  ),
};

export function ModuleSurface({
  href,
  title,
}: {
  href: string;
  title: string;
  sectionHref: string;
}) {
  const Module = moduleComponents[href];

  return (
    <section>
      {Module ? (
        <Module />
      ) : (
        <div className="grid min-h-[360px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div>
            <p className="font-black text-slate-900">This module still uses its full page</p>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              It remains fully available while its form is prepared for the shared workspace.
            </p>
            <Button asChild className="mt-4 rounded-xl">
              <Link href={href}>Open {title}</Link>
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
