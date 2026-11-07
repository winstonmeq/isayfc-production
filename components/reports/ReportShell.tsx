"use client";

import { type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getReportPeriod, PrintReportHeader } from "./PrintReportHeader";

export type Preset = "today" | "week" | "month" | "custom";

export const peso = (n: number) =>
  `₱${(Number(n) || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const qtyFmt = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH");

/** Builds the shared report query string from the current filter selection. */
export function buildRangeParams(opts: {
  preset: Preset;
  from: string;
  to: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (opts.preset === "custom") {
    if (opts.from) params.set("from", opts.from);
    if (opts.to) params.set("to", opts.to);
  } else {
    params.set("preset", opts.preset);
  }
  return params;
}

const presetLabel: Record<Exclude<Preset, "custom">, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

/**
 * Standard report page chrome: title, generated-at line, period filter bar with
 * presets + custom range and a Print button, then the report body. Provides a
 * print stylesheet so the report prints as a clean document (chrome hidden).
 */
export function ReportShell({
  title,
  subtitle,
  generatedAt,
  periodLabel,
  showRange = true,
  preset,
  from,
  to,
  onPreset,
  onFrom,
  onTo,
  onApply,
  extraFilters,
  children,
}: {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  periodLabel?: string;
  showRange?: boolean;
  preset: Preset;
  from: string;
  to: string;
  onPreset: (p: Preset) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onApply: () => void;
  extraFilters?: ReactNode;
  children: ReactNode;
}) {
  const { data: session } = useSession();
  const canPrint = session?.user?.role === "ADMIN" || session?.user?.permissions?.includes("reports.print");
  return (
    <div className="space-y-5 p-4 sm:p-6 print:p-0">
      {/* Print stylesheet: hide app chrome and filters, tidy tables. */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          table { font-size: 11px; }
          .print-break { break-inside: avoid; }
        }
      `}</style>

      <PrintReportHeader
        title={title}
        period={periodLabel || getReportPeriod(from, to)}
      />

      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{title}</h1>
          {subtitle ? (
            <p className="text-sm text-slate-500">{subtitle}</p>
          ) : null}
          <div className="mt-1 text-xs text-slate-400">
            {periodLabel ? <span>Period: {periodLabel}</span> : null}
            {periodLabel && generatedAt ? " • " : null}
            {generatedAt ? <span>Generated: {generatedAt}</span> : null}
          </div>
        </div>
        {canPrint && <Button
          variant="outline"
          className="no-print"
          onClick={() => window.print()}
        >
          <Printer className="mr-2 size-4" /> Print
        </Button>}
      </div>

      {/* Filter bar */}
      <div className="no-print flex flex-wrap items-end gap-2">
        {showRange && (
          <>
            {(["today", "week", "month"] as const).map((p) => (
              <Button
                key={p}
                variant={preset === p ? "default" : "outline"}
                className={preset === p ? "bg-rose-600 hover:bg-rose-700" : ""}
                onClick={() => onPreset(p)}
              >
                {presetLabel[p]}
              </Button>
            ))}
            <Button
              variant={preset === "custom" ? "default" : "outline"}
              className={
                preset === "custom" ? "bg-rose-600 hover:bg-rose-700" : ""
              }
              onClick={() => onPreset("custom")}
            >
              Custom
            </Button>

            {preset === "custom" && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => onFrom(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => onTo(e.target.value)}
                    className="w-40"
                  />
                </div>
                <Button
                  onClick={onApply}
                  className="bg-rose-600 hover:bg-rose-700"
                >
                  Apply
                </Button>
              </div>
            )}
          </>
        )}
        {extraFilters}
      </div>

      {children}
    </div>
  );
}

/** A labeled summary card used across reports. */
export function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 print-break">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-black ${
          highlight === "good"
            ? "text-emerald-600"
            : highlight === "bad"
              ? "text-rose-600"
              : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
