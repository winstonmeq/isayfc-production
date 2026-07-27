"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/app-shell/ModuleHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type CorrectionRow = {
  id: string;
  entityType: string;
  referenceNumber: string;
  correctionType: string;
  reason: string;
  transactionDate?: string;
  correctedAt?: string;
  correctedBy: string;
  status: string;
};

export function CorrectionRegisterPageClient() {
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/corrections?limit=200", {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || "Unable to load corrections.");
      }
      setRows(json.data as CorrectionRow[]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load corrections."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);

  return (
    <div className="space-y-5">
      <ModuleHeader
        title="Correction Register"
        description="Permanent audit history for voided, reversed, and corrected sales, payments, and deliveries."
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-2 size-4" />
            Refresh
          </Button>
        }
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="p-3">Corrected At</th>
              <th className="p-3">Record</th>
              <th className="p-3">Action</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Corrected By</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="p-3">
                  {row.correctedAt
                    ? new Date(row.correctedAt).toLocaleString("en-PH")
                    : "—"}
                </td>
                <td className="p-3">
                  <p className="font-medium">{row.referenceNumber || "—"}</p>
                  <p className="text-xs text-slate-400">{row.entityType}</p>
                </td>
                <td className="p-3">{row.correctionType}</td>
                <td className="max-w-md whitespace-normal p-3">{row.reason}</td>
                <td className="p-3">{row.correctedBy || "—"}</td>
                <td className="p-3">
                  <Badge variant="secondary">{row.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-slate-400" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-slate-500">
            No corrections have been recorded.
          </p>
        ) : null}
      </div>
    </div>
  );
}
