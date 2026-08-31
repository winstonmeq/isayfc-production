"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";

import type { TransferDetail } from "@/components/stock-transfers/TransferShared";
import { Button } from "@/components/ui/button";

function formatDateTime(value?: string) {
  if (!value) return "";

  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TransferPrintClient({ transferId }: { transferId: string }) {
  const [detail, setDetail] = useState<TransferDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/stock-transfers/${transferId}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Unable to load transfer.");
      }

      setDetail(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load transfer.");
    }
  }, [transferId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <p className="p-8 text-center text-sm text-rose-600">{error}</p>;
  }

  if (!detail) {
    return (
      <div className="p-10 text-center">
        <Loader2 className="mx-auto size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          nav, aside, header.app-topbar { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print mb-4 flex justify-end gap-2 p-4">
        <Button variant="outline" onClick={() => window.history.back()}>
          Back
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          Print
        </Button>
      </div>

      <div className="rounded-xl border border-slate-300 bg-white p-8 text-slate-900 print:rounded-none print:border-0 print:p-0">
        <div className="mb-6 border-b border-slate-300 pb-4 text-center">
          <h1 className="text-xl font-black uppercase tracking-wide">
            Delivery Receipt
          </h1>
          <p className="text-sm text-slate-600">Outlet Delivery — Main Branch</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="font-semibold">Transfer No.: </span>
            {detail.transferNumber}
          </div>
          <div>
            <span className="font-semibold">Status: </span>
            {detail.status.replaceAll("_", " ")}
          </div>
          <div>
            <span className="font-semibold">Deliver to: </span>
            {detail.outletName}
            {detail.outletCode ? ` (${detail.outletCode})` : ""}
          </div>
          <div>
            <span className="font-semibold">Dispatched: </span>
            {formatDateTime(detail.dispatchedAt) || "—"}
          </div>
          {detail.outletAddress ? (
            <div className="col-span-2">
              <span className="font-semibold">Address: </span>
              {detail.outletAddress}
            </div>
          ) : null}
          {detail.outletManager ? (
            <div>
              <span className="font-semibold">Manager: </span>
              {detail.outletManager}
            </div>
          ) : null}
          {detail.outletContact ? (
            <div>
              <span className="font-semibold">Contact: </span>
              {detail.outletContact}
            </div>
          ) : null}
        </div>

        <table className="mb-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Product</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 text-right">Received</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((item, index) => {
              const unit =
                item.unitLabel === "PACK"
                  ? "pack"
                  : item.unitLabel === "HEAD"
                    ? "head"
                    : item.unitLabel === "QTY"
                      ? "unit"
                      : "pcs";

              return (
                <tr key={item._id} className="border-b border-slate-200">
                  <td className="py-2 pr-2">{index + 1}</td>
                  <td className="py-2 pr-2">
                    {item.productName}
                    {item.unitLabel === "PACK" && item.packSize > 0
                      ? ` (${item.packSize}/pack)`
                      : ""}
                  </td>
                  <td className="py-2 pr-2 text-right">
                    {item.qty} {unit}
                  </td>
                  <td className="py-2 text-right">
                    {detail.status === "CONFIRMED"
                      ? `${item.receivedQty} ${unit}`
                      : ""}
                  </td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className="py-2 pr-2" colSpan={2}>
                TOTAL (pcs)
              </td>
              <td className="py-2 pr-2 text-right">{detail.totalQty}</td>
              <td className="py-2 text-right">
                {detail.status === "CONFIRMED" ? detail.totalReceivedQty : ""}
              </td>
            </tr>
          </tbody>
        </table>

        {detail.remarks ? (
          <p className="mb-6 text-sm">
            <span className="font-semibold">Remarks: </span>
            {detail.remarks}
          </p>
        ) : null}

        <div className="mt-12 grid grid-cols-2 gap-12 text-center text-sm">
          <div>
            <div className="border-t border-slate-800 pt-2">
              Released by (Main Branch)
            </div>
          </div>
          <div>
            <div className="border-t border-slate-800 pt-2">
              Received by (Outlet)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
