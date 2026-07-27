// components/app-shell/AppSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Flame,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Workflow,
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

type SectionName = NonNullable<AppNavItem["section"]>;

const sections: SectionName[] = ["Workspace", "Operations", "Finance", "Admin"];
const sectionHrefs: Record<SectionName, string> = {
  Workspace: "/workspace",
  Operations: "/operations",
  Finance: "/finance",
  Admin: "/admin",
};
const sectionIcons = {
  Workspace: LayoutGrid,
  Operations: Workflow,
  Finance: CircleDollarSign,
  Admin: Settings2,
};

function isRouteActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/sales") return pathname === "/sales";
  if (href === "/slicing") return pathname === "/slicing";
  if (href === "/payments") return pathname === "/payments";
  if (href === "/products") return pathname === "/products";

  return pathname === href || pathname.startsWith(`${href}/`);
}

function isItemActive(pathname: string, item: AppNavItem) {
  if (item.href) return isRouteActive(pathname, item.href);
  if (item.children) {
    return item.children.some((child) => isRouteActive(pathname, child.href));
  }

  return false;
}

function getWorkspaceHref(section: SectionName | undefined, href: string) {
  const area = section || "Workspace";
  return `${sectionHrefs[area]}?module=${encodeURIComponent(href)}`;
}

function hasPermission(
  userPermissions: string[],
  requiredPermission?: string,
  isAdmin = false
) {
  if (isAdmin) return true;
  if (!requiredPermission) return true;
  return userPermissions.includes(requiredPermission);
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

      if (visibleChildren && visibleChildren.length > 0) {
        return {
          ...item,
          children: visibleChildren,
        };
      }

      if (canViewParent && !item.children) return item;

      return null;
    })
    .filter(Boolean) as AppNavItem[];
}

function getActiveParentTitle(pathname: string, navItems: AppNavItem[]) {
  const activeParent = navItems.find((item) => {
    if (!item.children) return false;
    return item.children.some((child) => isRouteActive(pathname, child.href));
  });

  return activeParent?.title || null;
}

export function AppSidebar({ collapsed, onToggle, mobile = false, onNavigate }: Props) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const userPermissions = useMemo(() => {
    return (((session?.user as { permissions?: string[] } | undefined)?.permissions || []) as string[]).filter(Boolean);
  }, [session]);

  const legacyRole = String((session?.user as { role?: string } | undefined)?.role || "").toUpperCase();
  const roleName = String((session?.user as { roleName?: string } | undefined)?.roleName || "").toUpperCase();
  const isAdmin = legacyRole === "ADMIN" || roleName === "ADMIN";

  const visibleNavItems = useMemo(() => {
    if (status === "loading") return [];
    return filterNavItemsByPermissions(appNavItems, userPermissions, isAdmin);
  }, [status, userPermissions, isAdmin]);

  const activeSection = useMemo<SectionName>(() => {
    const sectionRoute = sections.find((section) =>
      pathname.startsWith(sectionHrefs[section])
    );
    if (sectionRoute) return sectionRoute;

    return (
      visibleNavItems.find((item) => isItemActive(pathname, item))?.section ||
      "Workspace"
    );
  }, [pathname, visibleNavItems]);

  useEffect(() => {
    const activeParentTitle = getActiveParentTitle(pathname, visibleNavItems);
    if (activeParentTitle) setOpenGroup(activeParentTitle);
  }, [pathname, visibleNavItems]);

  const groupedItems = useMemo(() => {
    return [
      {
        section: activeSection,
        items: visibleNavItems.filter(
          (item) =>
            (item.section || "Workspace") === activeSection &&
            item.href !== "/dashboard"
        ),
      },
    ];
  }, [activeSection, visibleNavItems]);

  function handleGroupClick(title: string) {
    if (collapsed && !mobile) return;
    setOpenGroup((current) => (current === title ? null : title));
  }

  function renderNavItem(item: AppNavItem) {
    const active = isItemActive(pathname, item);
    const Icon = item.icon;
    const isOpen = openGroup === item.title;

    if (!item.children) {
      return (
        <Link
          key={item.title}
          href={item.href ? getWorkspaceHref(item.section, item.href) : "#"}
          onClick={onNavigate}
          title={collapsed && !mobile ? item.title : undefined}
          className={cn(
            "group flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-all",
            active
              ? "bg-white text-slate-950 shadow-sm shadow-slate-950/10"
              : "text-white/80 hover:bg-white/12 hover:text-white",
            collapsed && !mobile && "justify-center px-0"
          )}
        >
          <Icon className={cn("h-5 w-5 shrink-0", active ? "text-teal-600" : "text-white/80 group-hover:text-white")} />
          {!collapsed || mobile ? <span className="truncate">{item.title}</span> : null}
        </Link>
      );
    }

    return (
      <div key={item.title} className="space-y-1">
        <button
          type="button"
          onClick={() => handleGroupClick(item.title)}
          title={collapsed && !mobile ? item.title : undefined}
          className={cn(
            "group flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-semibold transition-all",
            active || isOpen
              ? "bg-white/16 text-white"
              : "text-white/80 hover:bg-white/12 hover:text-white",
            collapsed && !mobile && "justify-center px-0"
          )}
        >
          <Icon className="h-5 w-5 shrink-0 text-white/85 group-hover:text-white" />
          {!collapsed || mobile ? (
            <>
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition", isOpen && "rotate-180")} />
            </>
          ) : null}
        </button>

        {(!collapsed || mobile) && isOpen ? (
          <div className="ml-5 space-y-1 border-l border-white/10 pl-3">
            {item.children.map((child) => {
              const ChildIcon = child.icon;
              const childActive = isRouteActive(pathname, child.href);

              return (
                <Link
                  key={child.href}
                  href={getWorkspaceHref(item.section, child.href)}
                  onClick={onNavigate}
                  className={cn(
                    "flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all",
                    childActive
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-white/70 hover:bg-white/12 hover:text-white"
                  )}
                >
                  {ChildIcon ? <ChildIcon className={cn("h-4 w-4", childActive ? "text-teal-600" : "text-white/70")} /> : null}
                  <span className="truncate">{child.title}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

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
          {mobile ? (
            <X className="h-5 w-5" />
          ) : collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </Button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        <div className={cn("grid gap-1", collapsed && !mobile ? "grid-cols-1" : "grid-cols-2")}>
          {sections.map((section) => {
            const SectionIcon = sectionIcons[section];
            const sectionActive = activeSection === section;
            const hasItems = visibleNavItems.some(
              (item) => (item.section || "Workspace") === section
            );
            if (!hasItems) return null;

            return (
              <Link
                key={section}
                href={sectionHrefs[section]}
                onClick={onNavigate}
                title={collapsed && !mobile ? section : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-black transition",
                  sectionActive
                    ? "bg-teal-400 text-slate-950"
                    : "bg-white/7 text-white/70 hover:bg-white/12 hover:text-white",
                  collapsed && !mobile && "justify-center px-0"
                )}
              >
                <SectionIcon className="h-4 w-4 shrink-0" />
                {!collapsed || mobile ? <span>{section}</span> : null}
              </Link>
            );
          })}
        </div>

        {groupedItems.map(({ section, items }) => {
          if (items.length === 0) return null;

          return (
            <div key={section} className="space-y-2">
              {!collapsed || mobile ? (
                <p className="px-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/35">
                  {section} modules
                </p>
              ) : null}

              <div className="space-y-1">{items.map(renderNavItem)}</div>
            </div>
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
