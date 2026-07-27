"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { appNavItems, type AppNavItem } from "@/components/app-shell/nav-config";
import { cn } from "@/lib/utils";
import { ModuleSurface } from "./ModuleSurface";

type SectionName = NonNullable<AppNavItem["section"]>;

const sectionDetails: Record<
  SectionName,
  { eyebrow: string; title: string; description: string; accent: string }
> = {
  Workspace: {
    eyebrow: "Master records",
    title: "Workspace",
    description:
      "Maintain the people, outlets, products, suppliers, and setup used by every transaction.",
    accent: "from-sky-600 to-blue-700",
  },
  Operations: {
    eyebrow: "Daily transactions",
    title: "Operations",
    description:
      "Receive stock, record production, complete sales, and follow today’s operational flow.",
    accent: "from-teal-600 to-emerald-700",
  },
  Finance: {
    eyebrow: "Money and control",
    title: "Finance",
    description:
      "Collect payments, review expenses, monitor inventory value, and understand profitability.",
    accent: "from-violet-600 to-indigo-700",
  },
  Admin: {
    eyebrow: "System control",
    title: "Administration",
    description:
      "Manage access, review activity, and keep system records accountable.",
    accent: "from-slate-700 to-slate-950",
  },
};

function hasPermission(
  permissions: string[],
  requiredPermission: string | undefined,
  isAdmin: boolean
) {
  return isAdmin || !requiredPermission || permissions.includes(requiredPermission);
}

function firstHref(item: AppNavItem) {
  return item.href || item.children?.[0]?.href || "#";
}

export function SectionHub({ section }: { section: SectionName }) {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const details = sectionDetails[section];
  const permissions = useMemo(
    () => (session?.user?.permissions || []).filter(Boolean),
    [session]
  );
  const role = String(
    session?.user?.roleName || session?.user?.role || ""
  ).toUpperCase();
  const isAdmin = role === "ADMIN";

  const items = useMemo(
    () =>
      appNavItems
        .filter((item) => item.section === section)
        .map((item) => ({
          ...item,
          children: item.children?.filter((child) =>
            hasPermission(permissions, child.permission, isAdmin)
          ),
        }))
        .filter(
          (item) =>
            hasPermission(permissions, item.permission, isAdmin) ||
            Boolean(item.children?.length)
        ),
    [isAdmin, permissions, section]
  );
  const actions = items
    .flatMap((item) =>
      item.children?.length
        ? item.children
        : item.href
          ? [{ title: item.title, href: item.href, icon: item.icon }]
          : []
    )
    .filter((action) => action.href !== "/dashboard");
  const selectedHref = searchParams.get("module");
  const selectedAction =
    actions.find((action) => action.href === selectedHref) || actions[0];
  const selectedActionHref = selectedAction?.href;
  const sectionHref = `/${section.toLowerCase()}`;
  const [recentModules, setRecentModules] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedActionHref) return;
    setRecentModules((current) => {
      const next = [
        ...current.filter((href) => href !== selectedActionHref),
        selectedActionHref,
      ];
      return next.slice(-4);
    });
  }, [selectedActionHref]);

  if (status === "loading") {
    return (
      <div className="grid min-h-[55vh] place-items-center text-sm font-semibold text-slate-500">
        Preparing your workspace…
      </div>
    );
  }

  if (selectedAction) {
    const mountedModules = recentModules.includes(selectedAction.href)
      ? recentModules
      : [...recentModules, selectedAction.href];

    return (
      <>
        {mountedModules.map((href) => {
          const action = actions.find((item) => item.href === href);
          if (!action) return null;
          const active = href === selectedAction.href;
          return (
            <div key={href} className={active ? "block" : "hidden"} aria-hidden={!active}>
              <ModuleSurface
                href={action.href}
                title={action.title}
                sectionHref={sectionHref}
              />
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div className="space-y-5">
      <section
        className={cn(
          "overflow-hidden rounded-[28px] bg-gradient-to-br px-6 py-7 text-white shadow-xl shadow-slate-950/10 lg:px-8",
          details.accent
        )}
      >
        <p className="text-xs font-black uppercase tracking-[0.2em] text-white/65">
          {details.eyebrow}
        </p>
        <div className="mt-2 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-black tracking-tight lg:text-4xl">
              {details.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75 lg:text-base">
              {details.description}
            </p>
          </div>
          <Badge className="w-fit rounded-xl border-white/15 bg-white/12 px-3 py-1.5 text-white hover:bg-white/12">
            {items.length} available modules
          </Badge>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-black text-slate-950">Choose what you need to do</h2>
          <p className="text-sm text-slate-500">
            Related actions stay together, so the transaction flow is easier to follow.
          </p>
        </div>

        {items.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item) => (
              <ModuleCard key={item.title} item={item} />
            ))}
          </div>
        ) : (
          <div className="grid min-h-52 place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <div>
              <CheckCircle2 className="mx-auto h-7 w-7 text-teal-600" />
              <p className="mt-3 font-bold text-slate-900">
                No modules are assigned to your role
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Ask an administrator if you need access to this work area.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ModuleCard({ item }: { item: AppNavItem }) {
  const Icon: LucideIcon = item.icon;
  const actions = item.children?.length
    ? item.children
    : item.href
      ? [{ title: `Open ${item.title}`, href: item.href, icon: item.icon }]
      : [];

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/[0.03]">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-black text-slate-950">{item.title}</h3>
            <Link
              href={`?module=${encodeURIComponent(firstHref(item))}`}
              scroll={false}
              className="hidden text-xs font-bold text-blue-700 hover:text-blue-900 sm:inline"
            >
              Open module
            </Link>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Select an action below to continue.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {actions.map((action) => {
          const ActionIcon = action.icon;
          return (
            <Link
              key={action.href}
              href={`?module=${encodeURIComponent(action.href)}`}
              scroll={false}
              className="group flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 transition hover:border-blue-200 hover:bg-blue-50/60"
            >
              {ActionIcon ? (
                <ActionIcon className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-blue-700" />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
                {action.title}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700" />
            </Link>
          );
        })}
      </div>
    </article>
  );
}
