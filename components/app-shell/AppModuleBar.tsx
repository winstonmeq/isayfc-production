"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  CircleDollarSign,
  Factory,
  FileChartColumn,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { isOutletRoute } from "@/lib/outlet-navigation";
import { appNavItems, type AppNavItem } from "./nav-config";

type SectionName = NonNullable<AppNavItem["section"]>;
type ModuleAction = {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
};
type TaskGroup = {
  title: string;
  icon: LucideIcon;
  routes: string[];
};

const sectionHrefs: Record<SectionName, string> = {
  Workspace: "/workspace",
  Operations: "/operations",
  Finance: "/finance",
  Admin: "/admin",
};

const taskGroups: Record<SectionName, TaskGroup[]> = {
  Workspace: [
    {
      title: "Directory",
      icon: Users,
      routes: [
        "/customers",
        "/suppliers",
        "/outlets",
        "/categories",
        "/products",
        "/units",
        "/bodega-products",
      ],
    },
  ],
  Operations: [
    {
      title: "Purchasing",
      icon: Truck,
      routes: ["/purchase-items", "/deliveries", "/supplier-invoices"],
    },
    {
      title: "Production",
      icon: Factory,
      routes: [
        "/slicing",
        "/slicing/new",
        "/slicing/production",
        "/profit/chicken-slicing",
        "/slicing/reconciliation",
        "/slicing/standard-packing",
      ],
    },
    {
      title: "Sales",
      icon: ShoppingCart,
      routes: [
        "/sales/history",
        "/sales/all",
        "/sales/discounts",
        "/sales/lines",
        "/stock-transfers",
      ],
    },
  ],
  Finance: [
    {
      title: "Finance",
      icon: CircleDollarSign,
      routes: [
        "/payments/history",
        "/payments",
        "/payments/add",
        "/payments/employee-credits",
        "/accounts-payable",
        "/supplier-payment-history",
      ],
    },
    {
      title: "Expenses",
      icon: ReceiptText,
      routes: ["/expenses-bodega"],
    },
    {
      title: "Inventory",
      icon: PackageSearch,
      routes: [
        "/inventory/bodega",
        "/inventory/products",
        "/inventory-adjustments",
      ],
    },
    {
      title: "Reports",
      icon: FileChartColumn,
      routes: [
        "/reports/gross-sales",
        "/reports/sales",
        "/reports/inventory",
        "/reports/payments",
        "/reports/overall",
      ],
    },
  ],
  Admin: [
    {
      title: "Users & Access",
      icon: ShieldCheck,
      routes: ["/users", "/roles", "/login-history", "/audit-logs", "/corrections"],
    },
  ],
};

function isRouteActive(pathname: string, href: string) {
  if (["/sales", "/slicing", "/payments", "/products"].includes(href)) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function moduleHref(section: SectionName, href: string) {
  return `${sectionHrefs[section]}?module=${encodeURIComponent(href)}`;
}

export function AppModuleBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const selectedModule = searchParams.get("module");
  const permissions = useMemo(
    () => (session?.user?.permissions || []).filter(Boolean),
    [session]
  );
  const role = String(
    session?.user?.roleName || session?.user?.role || ""
  ).toUpperCase();
  const isAdmin = role === "ADMIN";

  const activeSection = useMemo<SectionName>(() => {
    const sectionRoute = (Object.keys(sectionHrefs) as SectionName[]).find(
      (section) => pathname.startsWith(sectionHrefs[section])
    );
    if (sectionRoute) return sectionRoute;

    return (
      appNavItems.find(
        (item) =>
          (item.href && isRouteActive(pathname, item.href)) ||
          item.children?.some((child) => isRouteActive(pathname, child.href))
      )?.section || "Workspace"
    );
  }, [pathname]);

  const visibleModules = useMemo(() => {
    return appNavItems
      .filter((item) => item.section === activeSection)
      .flatMap<ModuleAction>((item) =>
        item.children?.length
          ? item.children.map((child) => ({
              title: child.title,
              href: child.href,
              icon: child.icon || item.icon,
              permission: child.permission,
            }))
          : item.href
            ? [
                {
                  title: item.title,
                  href: item.href,
                  icon: item.icon,
                  permission: item.permission,
                },
              ]
            : []
      )
      .filter(
        (module) =>
          module.href !== "/dashboard" &&
          (isAdmin ||
            !module.permission ||
            permissions.includes(module.permission))
      );
  }, [activeSection, isAdmin, permissions]);

  const groups = useMemo(
    () =>
      taskGroups[activeSection]
        .map((group) => ({
          ...group,
          modules: group.routes
            .map((route) =>
              visibleModules.find((module) => module.href === route)
            )
            .filter(Boolean) as ModuleAction[],
        }))
        .filter((group) => group.modules.length),
    [activeSection, visibleModules]
  );

  const activeGroup =
    groups.find((group) =>
      group.modules.some(
        (module) =>
          module.href === selectedModule ||
          (!selectedModule && isRouteActive(pathname, module.href))
      )
    ) || groups[0];

  if (isOutletRoute(pathname, selectedModule || "")) {
    return null;
  }

  if (status === "loading" || !activeGroup) {
    return <div className="h-11 border-b bg-white" />;
  }

  return (
    <div className="no-print sticky top-16 z-30 border-b border-slate-200 bg-white shadow-sm shadow-slate-950/[0.03]">
      <div className="flex h-11 items-center gap-1 overflow-x-auto bg-slate-50/80 px-3 sm:px-5 lg:px-6">
        <span className="mr-1 shrink-0 text-xs font-bold text-slate-400">
          {activeGroup.title}:
        </span>
        {activeGroup.modules.map((module) => {
          const Icon = module.icon;
          const active =
            module.href === selectedModule ||
            (!selectedModule && isRouteActive(pathname, module.href));
          return (
            <Link
              key={module.href}
              href={moduleHref(activeSection, module.href)}
              scroll={false}
              className={cn(
                "flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold transition",
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-sm"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {module.title}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
