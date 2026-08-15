"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMemo } from "react";
import {
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Flame,
  LayoutGrid,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Scissors,
  ShoppingCart,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { appNavItems, type AppNavItem } from "./nav-config";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  mobile?: boolean;
  onNavigate?: () => void;
};

function hasPermission(
  userPermissions: string[],
  requiredPermission?: string,
  isAdmin = false
) {
  return isAdmin || !requiredPermission || userPermissions.includes(requiredPermission);
}

function filterNavItemsByPermissions(
  navItems: AppNavItem[],
  userPermissions: string[],
  isAdmin = false
) {
  return navItems
    .map((item) => {
      const visibleChildren = item.children?.filter((child) =>
        hasPermission(userPermissions, child.permission, isAdmin)
      );
      const canViewParent = hasPermission(userPermissions, item.permission, isAdmin);

      if (visibleChildren?.length) return { ...item, children: visibleChildren };
      if (canViewParent && !item.children) return item;
      return null;
    })
    .filter(Boolean) as AppNavItem[];
}

export function AppSidebar({ collapsed, onToggle, mobile = false, onNavigate }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedModule = searchParams.get("module") || "";
  const { data: session, status } = useSession();

  const userPermissions = useMemo(
    () =>
      (((session?.user as { permissions?: string[] } | undefined)?.permissions || []) as string[]).filter(Boolean),
    [session]
  );
  const legacyRole = String((session?.user as { role?: string } | undefined)?.role || "").toUpperCase();
  const roleName = String((session?.user as { roleName?: string } | undefined)?.roleName || "").toUpperCase();
  const isAdmin = legacyRole === "ADMIN" || roleName === "ADMIN";

  const visibleNavItems = useMemo(
    () =>
      status === "loading"
        ? []
        : filterNavItemsByPermissions(appNavItems, userPermissions, isAdmin),
    [status, userPermissions, isAdmin]
  );

  const mainNavigation = useMemo(() => {
    const routes = visibleNavItems.flatMap((item) =>
      item.children?.map((child) => child.href) || (item.href ? [item.href] : [])
    );
    const canAccessAny = (targets: string[]) =>
      targets.some((target) =>
        routes.some((route) => route === target || route.startsWith(`${target}/`))
      );
    const firstChild = (title: string, fallback: string) =>
      visibleNavItems.find((item) => item.title === title)?.children?.[0]?.href || fallback;
    const firstVisibleRoute = (targets: string[], fallback: string) =>
      targets.find((target) => routes.includes(target)) || fallback;
    const financeHref = (module: string) =>
      `/finance?module=${encodeURIComponent(module)}`;
    const operationsHref = (module: string) =>
      `/operations?module=${encodeURIComponent(module)}`;

    return [
      canAccessAny(["/customers", "/suppliers", "/outlets", "/categories", "/products", "/bodega-products"])
        ? {
            label: "Workspace",
            href: "/workspace",
            icon: LayoutGrid,
            active: pathname.startsWith("/workspace") || selectedModule.startsWith("/outlets"),
          }
        : null,
      canAccessAny(["/purchase-items", "/deliveries"])
        ? {
            label: "Purchasing",
            href: operationsHref("/purchase-items"),
            icon: PackagePlus,
            active: ["/purchase-items", "/deliveries"].some((route) => selectedModule.startsWith(route)),
          }
        : null,
      canAccessAny(["/slicing"])
        ? {
            label: "Production",
            href: operationsHref("/slicing"),
            icon: Scissors,
            active: selectedModule.startsWith("/slicing"),
          }
        : null,
      canAccessAny(["/sales", "/stock-transfers"])
        ? {
            label: "Sales",
            href: operationsHref("/sales/history"),
            icon: ShoppingCart,
            active: ["/sales", "/stock-transfers"].some((route) => selectedModule.startsWith(route)),
          }
        : null,
      canAccessAny(["/payments"])
        ? {
            label: "Collections",
            href: financeHref("/payments"),
            icon: WalletCards,
            active: selectedModule.startsWith("/payments"),
          }
        : null,
      canAccessAny(["/outlet-summary", "/profit/chicken-slicing", "/profit/products"])
        ? {
            label: "Profitability",
            href: financeHref("/outlet-summary"),
            icon: BarChart3,
            active: ["/outlet-summary", "/profit/chicken-slicing", "/profit/products"].some((route) => selectedModule.startsWith(route)),
          }
        : null,
      canAccessAny(["/expenses-bodega"])
        ? {
            label: "Expenses",
            href: financeHref("/expenses-bodega"),
            icon: ReceiptText,
            active: selectedModule.startsWith("/expenses-bodega"),
          }
        : null,
      canAccessAny(["/inventory/bodega", "/inventory/products", "/outlet-inventory"])
        ? {
            label: "Inventory",
            href: financeHref("/inventory/bodega"),
            icon: Boxes,
            active: ["/inventory/bodega", "/inventory/products", "/outlet-inventory"].some((route) => selectedModule.startsWith(route)),
          }
        : null,
      canAccessAny(["/reports"])
        ? {
            label: "Reports",
            href: financeHref(firstChild("Reports", "/reports/sales")),
            icon: BarChart3,
            active: selectedModule.startsWith("/reports/"),
          }
        : null,
      canAccessAny(["/users", "/roles", "/audit-logs", "/corrections"])
        ? {
            label: "Users",
            href: `/admin?module=${encodeURIComponent(firstVisibleRoute(["/users", "/roles", "/audit-logs", "/corrections"], "/users"))}`,
            icon: Users,
            active: ["/users", "/roles", "/audit-logs", "/corrections"].includes(selectedModule),
          }
        : null,
    ].filter(Boolean) as Array<{
      label: string;
      href: string;
      icon: typeof LayoutGrid;
      active: boolean;
    }>;
  }, [pathname, selectedModule, visibleNavItems]);

  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-hidden border-r border-white/10 bg-slate-950 text-white shadow-2xl shadow-slate-950/20",
        mobile ? "w-[300px] max-w-[86vw]" : collapsed ? "w-[72px]" : "w-[252px]"
      )}
    >
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-teal-400 shadow-lg shadow-blue-950/30">
          <Flame className="h-6 w-6" />
        </div>

        {!collapsed || mobile ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black tracking-tight">ISAY Fried Chicken</p>
            <p className="truncate text-xs font-medium text-white/55">POS & Inventory ERP</p>
          </div>
        ) : null}

        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onToggle}
          className="h-9 w-9 shrink-0 rounded-xl text-white hover:bg-white/12 hover:text-white"
          title={mobile ? "Close menu" : collapsed ? "Expand menu" : "Collapse menu"}
        >
          {mobile ? <X className="h-5 w-5" /> : collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {mainNavigation.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              title={collapsed && !mobile ? item.label : undefined}
              className={cn(
                "group flex h-12 items-center gap-3 rounded-2xl px-3 text-sm font-bold transition-all",
                item.active
                  ? "bg-teal-400 text-slate-950 shadow-sm"
                  : "text-white/80 hover:bg-white/12 hover:text-white",
                collapsed && !mobile && "justify-center px-0"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed || mobile ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl bg-white/8 px-3 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/14 hover:text-white",
            collapsed && !mobile && "justify-center px-0"
          )}
        >
          {collapsed && !mobile ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          {!collapsed || mobile ? <span>{mobile ? "Close menu" : "Desktop mode"}</span> : null}
        </button>
      </div>
    </aside>
  );
}
