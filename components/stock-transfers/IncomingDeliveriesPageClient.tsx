"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCheck,
  Eye,
  Loader2,
  PackageCheck,
  RefreshCcw,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/app-shell/ModuleHeader";
import {
  StatusBadge,
  TransferDetailDialog,
  type TransferDetail,
  type TransferRow,
} from "@/components/stock-transfers/TransferShared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type OutletOption = { _id: string; name: string; code: string };

type ConfirmRowState = {
  itemId: string;
  productName: string;
  qty: number;
  unitLabel: "PACK" | "HEAD" | "PCS" | "QTY";
  packSize: number;
  receivedQty: string;
  remarks: string;
};

function formatDate(value?: string) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function IncomingDeliveriesPageClient() {
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [outletFilter, setOutletFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(false);

  const [detail, setDetail] = useState<TransferDetail | null>(null);

  // Confirmation dialog state.
  const [confirmTarget, setConfirmTarget] = useState<TransferDetail | null>(null);
  const [confirmRows, setConfirmRows] = useState<ConfirmRowState[]>([]);
  const [outletRemarks, setOutletRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadTransfers = useCallback(async () => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        incoming: "true",
        page: "1",
        limit: "50",
      });

      if (outletFilter !== "ALL") params.set("outletId", outletFilter);

      const res = await fetch(`/api/stock-transfers?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Unable to load incoming deliveries.");
      }

      setTransfers(Array.isArray(json.data) ? json.data : []);
      setOutlets(Array.isArray(json.outlets) ? json.outlets : []);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load incoming deliveries."
      );
    } finally {
      setIsLoading(false);
    }
  }, [outletFilter]);

  useEffect(() => {
    void loadTransfers();
  }, [loadTransfers]);

  async function fetchDetail(transferId: string) {
    const res = await fetch(`/api/stock-transfers/${transferId}`, {
      cache: "no-store",
    });
    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.message || "Unable to load transfer.");
    }

    return json.data as TransferDetail;
  }

  async function openDetail(transferId: string) {
    try {
      setDetail(await fetchDetail(transferId));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load transfer."
      );
    }
  }

  async function markDelivered(transfer: TransferRow) {
    setBusyId(transfer._id);

    try {
      const res = await fetch(`/api/stock-transfers/${transfer._id}/deliver`, {
        method: "POST",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Unable to mark as delivered.");
      }

      toast.success(json.message);
      void loadTransfers();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to mark as delivered."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function openConfirm(transferId: string) {
    try {
      const data = await fetchDetail(transferId);

      setConfirmTarget(data);
      setOutletRemarks("");
      setConfirmRows(
        data.items.map((item) => ({
          itemId: item._id,
          productName: item.productName,
          qty: item.qty,
          unitLabel: item.unitLabel,
          packSize: item.packSize,
          receivedQty: String(item.qty),
          remarks: "",
        }))
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load transfer."
      );
    }
  }

  function updateRow(index: number, patch: Partial<ConfirmRowState>) {
    setConfirmRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  async function submitConfirmation() {
    if (!confirmTarget) return;

    for (const row of confirmRows) {
      const received = Number(row.receivedQty);

      if (!Number.isFinite(received) || received < 0 || received > row.qty) {
        toast.error(
          `Received quantity for ${row.productName} must be between 0 and ${row.qty}.`
        );
        return;
      }

      if (received < row.qty && !row.remarks.trim()) {
        toast.error(
          `Please add a remark for ${row.productName} explaining the missing or rejected quantity.`
        );
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(
        `/api/stock-transfers/${confirmTarget._id}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outletRemarks,
            items: confirmRows.map((row) => ({
              itemId: row.itemId,
              receivedQty: Number(row.receivedQty),
              remarks: row.remarks,
            })),
          }),
        }
      );

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Unable to confirm delivery.");
      }

      toast.success(json.message);
      setConfirmTarget(null);
      void loadTransfers();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to confirm delivery."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const discrepancyItemCount = confirmRows.reduce((count, row) => {
    const received = Number(row.receivedQty);
    if (!Number.isFinite(received)) return count;
    return received < row.qty ? count + 1 : count;
  }, 0);

  return (
    <div>
      <ModuleHeader
        eyebrow="Outlets"
        title="Incoming Deliveries"
        description="Deliveries dispatched from the main branch. Count the items, report any discrepancies, and confirm to receive them into outlet inventory."
        actions={
          <Button
            variant="outline"
            onClick={() => void loadTransfers()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
            Refresh
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-64 space-y-1.5">
            <Label>Outlet</Label>
            <Select value={outletFilter} onValueChange={setOutletFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All outlets</SelectItem>
                {outlets.map((outlet) => (
                  <SelectItem key={outlet._id} value={outlet._id}>
                    {outlet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transfer #</TableHead>
                <TableHead>Dispatched</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && transfers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : transfers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-slate-500"
                  >
                    <PackageCheck className="mx-auto mb-2 size-6" />
                    No incoming deliveries. Everything has been received.
                  </TableCell>
                </TableRow>
              ) : (
                transfers.map((transfer) => (
                  <TableRow key={transfer._id}>
                    <TableCell className="font-medium">
                      {transfer.transferNumber}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(transfer.dispatchedAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {transfer.outletName}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {transfer.totalItems}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {transfer.totalQty}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={transfer.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View details"
                          onClick={() => void openDetail(transfer._id)}
                        >
                          <Eye className="size-4" />
                        </Button>

                        {transfer.status === "IN_TRANSIT" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Mark goods as arrived"
                            disabled={busyId === transfer._id}
                            onClick={() => void markDelivered(transfer)}
                          >
                            <Truck className="size-4" />
                          </Button>
                        ) : null}

                        <Button
                          size="sm"
                          disabled={busyId === transfer._id}
                          onClick={() => void openConfirm(transfer._id)}
                        >
                          <CheckCheck className="size-4" />
                          Confirm
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Confirm {confirmTarget?.transferNumber}
            </DialogTitle>
            <DialogDescription>
              Count each product and enter the quantity actually received in
              good condition. Anything short or rejected needs a remark — the
              main branch will see it as a discrepancy report.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {confirmRows.map((row, index) => {
              const received = Number(row.receivedQty);
              const variance = Number.isFinite(received)
                ? Math.max(row.qty - received, 0)
                : 0;
              const unit =
                row.unitLabel === "PACK"
                  ? "pack"
                  : row.unitLabel === "HEAD"
                    ? "head"
                    : row.unitLabel === "QTY"
                      ? "unit"
                      : "pcs";
              const isPack = row.unitLabel === "PACK" && row.packSize > 0;
              const receivedPcs =
                isPack && Number.isFinite(received) ? received * row.packSize : 0;

              return (
                <div
                  key={row.itemId}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {row.productName}
                      {isPack ? (
                        <span className="ml-1 text-xs text-slate-400">
                          ({row.packSize}/pack)
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-slate-500">
                      Sent: {row.qty} {unit}
                    </p>
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Received quantity ({unit})</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={row.qty}
                          value={row.receivedQty}
                          onChange={(event) =>
                            updateRow(index, { receivedQty: event.target.value })
                          }
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateRow(index, { receivedQty: String(row.qty) })
                          }
                        >
                          All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateRow(index, { receivedQty: "0" })}
                        >
                          Reject
                        </Button>
                      </div>
                      {receivedPcs > 0 ? (
                        <p className="text-xs text-slate-500">
                          = {receivedPcs} pcs into outlet inventory
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <Label>
                        Remarks{variance > 0 ? " (required)" : " (optional)"}
                      </Label>
                      <Input
                        placeholder={
                          variance > 0
                            ? "e.g. 2 pcs damaged in transit"
                            : "Optional note"
                        }
                        value={row.remarks}
                        onChange={(event) =>
                          updateRow(index, { remarks: event.target.value })
                        }
                      />
                    </div>
                  </div>

                  {variance > 0 ? (
                    <p className="mt-2 text-xs font-semibold text-amber-600">
                      Discrepancy: {variance} {unit} short or rejected
                    </p>
                  ) : null}
                </div>
              );
            })}

            <div className="space-y-1.5">
              <Label>Overall remarks (optional)</Label>
              <Textarea
                rows={2}
                value={outletRemarks}
                onChange={(event) => setOutletRemarks(event.target.value)}
                placeholder="Notes for the main branch about this delivery"
              />
            </div>

            {discrepancyItemCount > 0 ? (
              <p className="text-sm font-semibold text-amber-600">
                This confirmation will report {discrepancyItemCount} item
                {discrepancyItemCount > 1 ? "s" : ""} with discrepancies to the
                main branch.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setConfirmTarget(null)}
            >
              Cancel
            </Button>
            <Button disabled={isSubmitting} onClick={() => void submitConfirmation()}>
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCheck className="size-4" />
              )}
              Confirm & Receive Into Inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransferDetailDialog detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
