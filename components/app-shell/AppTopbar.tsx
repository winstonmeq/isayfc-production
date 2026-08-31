// components/app-shell/AppTopbar.tsx
"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, UserCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { appNavItems, type AppNavItem } from "./nav-config";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  onMobileMenu: () => void;
};

type SectionName = NonNullable<AppNavItem["section"]>;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function AppTopbar({ collapsed, onToggle, onMobileMenu }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const user = session?.user;
  const displayName = user?.name || user?.username || "User";
  const roleName = user?.roleName || user?.role || "Staff";
  const selectedModule = searchParams.get("module") || "";
  const isPurchasingModule = [
    "/purchase-items",
    "/deliveries",
    "/supplier-invoices",
  ].some(
    (route) => selectedModule === route || pathname === route
  );
  const isProductionModule = ["/slicing"].some(
    (route) =>
      selectedModule === route ||
      selectedModule.startsWith(`${route}/`) ||
      pathname === route ||
      pathname.startsWith(`${route}/`)
  );
  const isSalesModule = ["/sales", "/stock-transfers"].some(
    (route) =>
      selectedModule === route ||
      selectedModule.startsWith(`${route}/`) ||
      pathname === route ||
      pathname.startsWith(`${route}/`)
  );
  const isPosModule = pathname === "/pos" || pathname.startsWith("/pos/");
  const isCollectionsModule = ["/payments", "/accounts-payable"].some(
    (route) =>
      selectedModule === route ||
      selectedModule.startsWith(`${route}/`) ||
      pathname === route ||
      pathname.startsWith(`${route}/`)
  );
  const isProfitabilityModule = [
    "/outlet-summary",
    "/profit/chicken-slicing",
  ].some(
    (route) =>
      selectedModule === route ||
      selectedModule.startsWith(`${route}/`) ||
      pathname === route ||
      pathname.startsWith(`${route}/`)
  );
  const isExpensesModule =
    selectedModule === "/expenses-bodega" || pathname === "/expenses-bodega";
  const isInventoryModule = [
    "/inventory/bodega",
    "/inventory/products",
    "/outlet-inventory",
    "/stock-counts",
    "/inventory-adjustments",
  ].some(
    (route) =>
      selectedModule === route ||
      selectedModule.startsWith(`${route}/`) ||
      pathname === route ||
      pathname.startsWith(`${route}/`)
  );
  const currentArea = selectedModule.startsWith("/reports/")
    ? "Reports"
    : ["/users", "/roles", "/audit-logs", "/corrections"].includes(selectedModule)
      ? "Users"
      : isPurchasingModule
        ? "Purchasing"
        : isProductionModule
          ? "Production"
          : isPosModule
            ? "Outlet POS"
          : isSalesModule
            ? "Sales"
            : isCollectionsModule
              ? "Collections"
              : isProfitabilityModule
                ? "Profitability"
                : isExpensesModule
                  ? "Expenses"
                  : isInventoryModule
                    ? "Inventory"
            : pathname.startsWith("/operations")
              ? "Operations"
    : pathname.startsWith("/finance")
      ? "Finance"
      : pathname.startsWith("/admin")
        ? "Administration"
        : pathname.startsWith("/workspace")
          ? "Workspace"
          : "Home";
  const permissions = user?.permissions || [];
  const normalizedRole = String(user?.roleName || user?.role || "").toUpperCase();
  const isAdmin = normalizedRole === "ADMIN";
  const canViewReports =
    isAdmin || permissions.some((permission) => permission.startsWith("reports."));
  const canManageUsers =
    isAdmin ||
    permissions.includes("users.view") ||
    permissions.includes("roles.view") ||
    permissions.includes("audit-logs.view") ||
    permissions.includes("activity-logs.view");
  const firstReport =
    [
      ["reports.sales", "/reports/sales"],
      ["reports.inventory", "/reports/inventory"],
      ["reports.payments", "/reports/payments"],
      ["reports.profit", "/reports/profit"],
    ].find(([permission]) => isAdmin || permissions.includes(permission))?.[1] ||
    "/reports/sales";
  const firstUserModule = isAdmin || permissions.includes("users.view")
    ? "/users"
    : permissions.includes("roles.view")
      ? "/roles"
      : "/audit-logs";
  function canAccessSection(section: SectionName) {
    if (isAdmin) return true;
    return appNavItems
      .filter((item) => item.section === section)
      .some(
        (item) =>
          (!item.permission || permissions.includes(item.permission)) ||
          item.children?.some(
            (child) =>
              !child.permission || permissions.includes(child.permission)
          )
      );
  }
  function canAccessAnyRoute(routes: string[]) {
    if (isAdmin) return true;
    return appNavItems
      .filter((item) => item.section === "Operations")
      .flatMap((item) =>
        item.children?.length
          ? item.children.map((child) => ({
              href: child.href,
              permission: child.permission,
            }))
          : item.href
            ? [{ href: item.href, permission: item.permission }]
            : []
      )
      .some(
        (item) =>
          routes.some(
            (route) =>
              item.href === route || item.href.startsWith(`${route}/`)
          ) &&
          (!item.permission || permissions.includes(item.permission))
      );
  }
  function canAccessAnyFinanceRoute(routes: string[]) {
    if (isAdmin) return true;
    return appNavItems
      .filter((item) => item.section === "Finance")
      .flatMap((item) =>
        item.children?.length
          ? item.children.map((child) => ({
              href: child.href,
              permission: child.permission,
            }))
          : item.href
            ? [{ href: item.href, permission: item.permission }]
            : []
      )
      .some(
        (item) =>
          routes.some(
            (route) =>
              item.href === route || item.href.startsWith(`${route}/`)
          ) &&
          (!item.permission || permissions.includes(item.permission))
      );
  }

  const primaryNavigation = [
    ...(canAccessSection("Workspace")
      ? [
          {
            label: "Workspace",
            href: "/workspace",
            active:
              (pathname.startsWith("/workspace") &&
                !selectedModule.startsWith("/reports/")) ||
              selectedModule.startsWith("/outlets") ||
              pathname.startsWith("/outlets"),
          },
        ]
      : []),
    ...(canAccessAnyRoute(["/purchase-items", "/deliveries", "/supplier-invoices"])
      ? [
          {
            label: "Purchasing",
            href: `/operations?module=${encodeURIComponent("/purchase-items")}`,
            active: isPurchasingModule,
          },
        ]
      : []),
    ...(canAccessAnyRoute(["/slicing"])
      ? [
          {
            label: "Production",
            href: `/operations?module=${encodeURIComponent("/slicing")}`,
            active: isProductionModule,
          },
        ]
      : []),
    ...(canAccessAnyRoute(["/sales", "/stock-transfers"])
      ? [
          {
            label: "Sales",
            href: `/operations?module=${encodeURIComponent("/sales/history")}`,
            active: isSalesModule,
          },
        ]
      : []),
    ...((isAdmin || permissions.includes("pos.view"))
      ? [
          {
            label: "POS",
            href: "/pos",
            active: isPosModule,
          },
        ]
      : []),
    ...(canAccessAnyFinanceRoute(["/payments", "/accounts-payable"])
      ? [
          {
            label: "Collections",
            href: `/finance?module=${encodeURIComponent("/payments")}`,
            active: isCollectionsModule,
          },
        ]
      : []),
    ...(canAccessAnyFinanceRoute([
      "/outlet-summary",
      "/profit/chicken-slicing",
    ])
      ? [
          {
            label: "Profitability",
            href: `/finance?module=${encodeURIComponent("/outlet-summary")}`,
            active: isProfitabilityModule,
          },
        ]
      : []),
    ...(canAccessAnyFinanceRoute(["/expenses-bodega"])
      ? [
          {
            label: "Expenses",
            href: `/finance?module=${encodeURIComponent("/expenses-bodega")}`,
            active: isExpensesModule,
          },
        ]
      : []),
    ...(canAccessAnyFinanceRoute([
      "/inventory/bodega",
      "/inventory/products",
      "/outlet-inventory",
      "/stock-counts",
      "/inventory-adjustments",
    ])
      ? [
          {
            label: "Inventory",
            href: `/finance?module=${encodeURIComponent("/inventory/bodega")}`,
            active: isInventoryModule,
          },
        ]
      : []),
    ...(canViewReports
      ? [
          {
            label: "Reports",
            href: `/finance?module=${encodeURIComponent(firstReport)}`,
            active: selectedModule.startsWith("/reports/"),
          },
        ]
      : []),
    ...(canManageUsers
      ? [
          {
            label: "Users",
            href: `/admin?module=${encodeURIComponent(firstUserModule)}`,
            active: ["/users", "/roles", "/audit-logs", "/corrections"].includes(selectedModule),
          },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-3 sm:px-5 lg:px-6">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onMobileMenu}
          className="h-10 w-10 rounded-2xl lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onToggle}
          className="hidden h-10 w-10 rounded-2xl lg:inline-flex"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            {getGreeting()}
          </p>
          <h1 className="truncate text-base font-black text-slate-950 sm:text-lg">
            {currentArea}
          </h1>
        </div>

        <nav className="hidden items-center gap-1 rounded-2xl bg-slate-100 p-1 xl:flex">
          {primaryNavigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-bold transition",
                item.active
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-950"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <UserCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="max-w-[150px] truncate text-sm font-bold text-slate-950">{displayName}</p>
            <p className="max-w-[150px] truncate text-xs text-slate-500">{roleName}</p>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={cn(
            "h-10 rounded-xl bg-slate-900 px-3 font-bold hover:bg-slate-800",
            "sm:px-4"
          )}
        >
          <LogOut className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}
