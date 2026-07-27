import Link from "next/link";
import { getServerSession } from "next-auth";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  CreditCard,
  PackageSearch,
  ReceiptText,
  Scissors,
  ShoppingBasket,
  ShoppingCart,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import {
  getDashboardSummary,
  type DashboardActivityItem,
} from "@/lib/dashboard";
import { formatPeso } from "@/lib/utils";

type Workspace = "cashier" | "slicing" | "inventory";

type Action = {
  title: string;
  description: string;
  href: string;
  permission: string;
  icon: LucideIcon;
  accent: string;
  shortcut?: string;
};

const workspaceDetails: Record<
  Workspace,
  { label: string; description: string; permission: string }
> = {
  cashier: {
    label: "Cashier",
    description: "Sales, collections, and customer records",
    permission: "sales.view",
  },
  slicing: {
    label: "Slicing",
    description: "Production, packs, and daily output",
    permission: "slicing.view",
  },
  inventory: {
    label: "Inventory",
    description: "Stock checks, transfers, and movements",
    permission: "inventory.view",
  },
};

const workspaceActions: Record<Workspace, Action[]> = {
  cashier: [
    {
      title: "Sell chicken",
      description: "Create a pack-based chicken sale",
      href: "/sales",
      permission: "sales.manage",
      icon: ShoppingCart,
      accent: "bg-blue-600",
      shortcut: "1",
    },
    {
      title: "Grocery sale",
      description: "Sell grocery products by quantity",
      href: "/sales/grocery",
      permission: "sales.manage",
      icon: ShoppingBasket,
      accent: "bg-teal-600",
      shortcut: "2",
    },
    {
      title: "Record payment",
      description: "Apply a collection to customer balances",
      href: "/payments/add",
      permission: "payments.manage",
      icon: CreditCard,
      accent: "bg-violet-600",
      shortcut: "3",
    },
  ],
  slicing: [
    {
      title: "New slicing",
      description: "Record today's slicing production",
      href: "/slicing/new",
      permission: "slicing.manage",
      icon: Scissors,
      accent: "bg-blue-600",
      shortcut: "1",
    },
    {
      title: "Slicing history",
      description: "Review and manage production records",
      href: "/slicing",
      permission: "slicing.view",
      icon: Clock3,
      accent: "bg-teal-600",
      shortcut: "2",
    },
    {
      title: "Packing setup",
      description: "Check pieces per pack configuration",
      href: "/slicing/standard-packing",
      permission: "standard-packing.view",
      icon: Boxes,
      accent: "bg-amber-600",
      shortcut: "3",
    },
  ],
  inventory: [
    {
      title: "Check inventory",
      description: "Review current product stock",
      href: "/inventory/products",
      permission: "inventory.view",
      icon: PackageSearch,
      accent: "bg-blue-600",
      shortcut: "1",
    },
    {
      title: "Stock movements",
      description: "Trace incoming and outgoing quantities",
      href: "/reports/inventory-movements",
      permission: "reports.inventory",
      icon: ClipboardCheck,
      accent: "bg-teal-600",
      shortcut: "2",
    },
    {
      title: "Stock transfers",
      description: "Prepare or review outlet transfers",
      href: "/stock-transfers",
      permission: "stock-transfers.view",
      icon: Boxes,
      accent: "bg-violet-600",
      shortcut: "3",
    },
  ],
};

function hasPermission(permissions: string[], permission: string, isAdmin: boolean) {
  return isAdmin || permissions.includes(permission);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ActivityRows({
  items,
  emptyMessage,
}: {
  items: DashboardActivityItem[];
  emptyMessage: string;
}) {
  if (!items.length) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center">
        <CheckCircle2 className="mb-2 h-6 w-6 text-teal-600" />
        <p className="text-sm font-semibold text-slate-700">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {items.slice(0, 6).map((item) => (
        <div key={item.id} className="flex items-center gap-3 py-3">
          <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
            <p className="truncate text-xs text-slate-500">
              {item.subtitle} · {formatDateTime(item.date)}
            </p>
          </div>
          {typeof item.amount === "number" ? (
            <p className="text-sm font-black tabular-nums text-slate-900">
              {formatPeso(item.amount)}
            </p>
          ) : null}
          {item.status ? (
            <Badge variant="secondary" className="hidden rounded-lg sm:inline-flex">
              {item.status}
            </Badge>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const [summary, session, query] = await Promise.all([
    getDashboardSummary(),
    getServerSession(authOptions),
    searchParams,
  ]);

  const permissions = (session?.user?.permissions || []).filter(Boolean);
  const roleName = String(session?.user?.roleName || session?.user?.role || "").toUpperCase();
  const isAdmin = roleName === "ADMIN";
  const availableWorkspaces = (Object.keys(workspaceDetails) as Workspace[]).filter(
    (workspace) =>
      hasPermission(permissions, workspaceDetails[workspace].permission, isAdmin)
  );
  const requested = query.workspace as Workspace | undefined;
  const inferred: Workspace = roleName.includes("SLIC")
    ? "slicing"
    : roleName.includes("INVENT")
      ? "inventory"
      : "cashier";
  const activeWorkspace =
    requested && availableWorkspaces.includes(requested)
      ? requested
      : availableWorkspaces.includes(inferred)
        ? inferred
        : availableWorkspaces[0] || "cashier";
  const actions = workspaceActions[activeWorkspace].filter((action) =>
    hasPermission(permissions, action.permission, isAdmin)
  );
  const displayName =
    session?.user?.name || session?.user?.username || workspaceDetails[activeWorkspace].label;

  const activity =
    activeWorkspace === "slicing"
      ? summary.recent.slicing
      : activeWorkspace === "inventory"
        ? []
        : [...summary.recent.sales, ...summary.recent.payments]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const activityHref =
    activeWorkspace === "slicing"
      ? "/slicing"
      : activeWorkspace === "inventory"
        ? "/reports/inventory-movements"
        : "/sales/history";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-5 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-7">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge className="rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-50">
                {workspaceDetails[activeWorkspace].label} workspace
              </Badge>
              <span className="text-xs font-medium text-slate-400">
                {new Date().toLocaleDateString("en-PH", {
                  timeZone: "Asia/Manila",
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Ready when you are, {displayName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {workspaceDetails[activeWorkspace].description}. Choose one task to begin.
            </p>
          </div>

          {availableWorkspaces.length > 1 ? (
            <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
              {availableWorkspaces.map((workspace) => (
                <Link
                  key={workspace}
                  href={`/dashboard?workspace=${workspace}`}
                  className={
                    workspace === activeWorkspace
                      ? "rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow-sm"
                      : "rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 transition hover:text-slate-950"
                  }
                >
                  {workspaceDetails[workspace].label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <div className="p-5 lg:p-7">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            Start a transaction
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex min-h-32 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5"
                >
                  <div className={`rounded-2xl p-3 text-white ${action.accent}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-black text-slate-950">{action.title}</h2>
                      <span className="hidden rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 xl:inline">
                        {action.shortcut}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-500">
                      {action.description}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700">
                      Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <Card className="rounded-3xl border-slate-200 shadow-none">
          <CardContent className="p-5 lg:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-black text-slate-950">Today at a glance</h2>
                <p className="text-sm text-slate-500">Only the numbers needed for this shift.</p>
              </div>
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link href={activityHref}>Manage records</Link>
              </Button>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {activeWorkspace === "cashier" ? (
                <>
                  <Stat label="Sales" value={formatPeso(summary.today.sales)} />
                  <Stat label="Payments" value={formatPeso(summary.today.payments)} />
                  <Stat label="Transactions" value={String(summary.today.salesCount)} />
                  <Stat label="Receivables" value={formatPeso(summary.outstandingReceivables)} />
                </>
              ) : activeWorkspace === "slicing" ? (
                <>
                  <Stat label="Batches" value={String(summary.today.slicingCount)} />
                  <Stat label="Heads" value={String(summary.today.slicingHeads)} />
                  <Stat label="Packs" value={String(summary.today.slicingPacks)} />
                  <Stat label="Actual pieces" value={String(summary.today.slicingActualPcs)} />
                </>
              ) : (
                <>
                  <Stat label="Stock pieces" value={summary.bodegaStock.totalPcs.toLocaleString()} />
                  <Stat label="Low stock" value={String(summary.bodegaStock.lowStockCount)} />
                  <Stat label="Out of stock" value={String(summary.bodegaStock.outOfStockCount)} />
                  <Stat label="Stock value" value={formatPeso(summary.bodegaStock.totalCostValue)} />
                </>
              )}
            </div>

            <h3 className="mb-1 text-sm font-black text-slate-900">Recent activity</h3>
            <ActivityRows
              items={activity}
              emptyMessage={
                activeWorkspace === "inventory"
                  ? "Open stock movements to review inventory activity."
                  : "No activity recorded for this workspace yet."
              }
            />
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-slate-200 shadow-none">
          <CardContent className="p-5 lg:p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-xl bg-amber-50 p-2 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-black text-slate-950">Needs attention</h2>
                <p className="text-sm text-slate-500">Check these before ending the shift.</p>
              </div>
            </div>

            <div className="space-y-3">
              {summary.outstandingReceivables > 0 &&
              hasPermission(permissions, "payments.view", isAdmin) ? (
                <AttentionItem
                  title="Customer balances"
                  detail={`${formatPeso(summary.outstandingReceivables)} is still unpaid`}
                  href="/payments"
                />
              ) : null}
              {summary.bodegaStock.lowStockProducts.slice(0, 4).map((product) => (
                <AttentionItem
                  key={product.id}
                  title={product.name}
                  detail={product.status === "out" ? "Out of stock" : `Low stock · ${product.display}`}
                  href="/reports/inventory"
                />
              ))}
              {!summary.outstandingReceivables &&
              !summary.bodegaStock.lowStockProducts.length ? (
                <div className="rounded-2xl bg-teal-50 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-teal-700" />
                    <div>
                      <p className="font-bold text-teal-950">Everything looks clear</p>
                      <p className="text-sm text-teal-700">No urgent records need attention.</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {hasPermission(permissions, "sales.view", isAdmin) ? (
                <Button asChild variant="outline" className="justify-between rounded-xl">
                  <Link href="/sales/history">
                    Review sales <ReceiptText className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
              {hasPermission(permissions, "corrections.view", isAdmin) ||
              hasPermission(permissions, "audit-logs.view", isAdmin) ? (
                <Button asChild variant="outline" className="justify-between rounded-xl">
                  <Link href="/corrections">
                    Correction register <ClipboardCheck className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-2 truncate text-xl font-black tabular-nums text-slate-950">{value}</p>
    </div>
  );
}

function AttentionItem({
  title,
  detail,
  href,
}: {
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-3 transition hover:bg-amber-50"
    >
      <Clock3 className="h-4 w-4 shrink-0 text-amber-700" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900">{title}</p>
        <p className="truncate text-xs text-slate-500">{detail}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
    </Link>
  );
}
