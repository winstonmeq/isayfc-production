"use client";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type TransferRow = {
  _id: string;
  transferNumber: string;
  status: string;
  transferDate?: string;
  saleId?: string;
  outletId: string;
  outletName: string;
  outletCode: string;
  totalItems: number;
  totalQty: number;
  totalReceivedQty: number;
  totalVarianceQty: number;
  hasDiscrepancy: boolean;
  remarks: string;
  outletRemarks: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  confirmedAt?: string;
  createdAt?: string;
};

export type TransferItemRow = {
  _id: string;
  source: "BODEGA" | "GROCERY";
  bodegaProductId: string;
  productId: string;
  standardPackingId: string;
  productName: string;
  categoryName: string;
  packSize: number;
  unitLabel: "PACK" | "HEAD" | "PCS" | "QTY";
  buyingPrice: number;
  sellingPrice: number;
  qty: number;
  qtyPcs: number;
  receivedQty: number;
  receivedPcs: number;
  varianceQty: number;
  itemStatus: string;
  remarks: string;
};

export type TransferDetail = TransferRow & {
  outletAddress: string;
  outletContact: string;
  outletManager: string;
  items: TransferItemRow[];
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-slate-100 text-slate-700" },
  IN_TRANSIT: {
    label: "In Transit",
    className: "bg-sky-100 text-sky-700",
  },
  DELIVERED: { label: "Delivered", className: "bg-violet-100 text-violet-700" },
  CONFIRMED: { label: "Confirmed", className: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "Cancelled", className: "bg-rose-100 text-rose-700" },
};

const ITEM_STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_BADGE[status] || {
    label: status,
    className: "bg-slate-100 text-slate-700",
  };

  return <Badge className={config.className}>{config.label}</Badge>;
}

export function ItemStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={ITEM_STATUS_BADGE[status] || "bg-slate-100 text-slate-700"}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "-";

  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TransferDetailDialog({
  detail,
  onClose,
}: {
  detail: TransferDetail | null;
  onClose: () => void;
}) {
  const confirmed = detail?.status === "CONFIRMED";

  return (
    <Dialog
      open={Boolean(detail)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-[95vw] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {detail?.transferNumber}
            {detail ? <StatusBadge status={detail.status} /> : null}
            {detail?.hasDiscrepancy ? (
              <Badge className="bg-amber-100 text-amber-700">Discrepancy</Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {detail
              ? `To ${detail.outletName}${detail.outletCode ? ` (${detail.outletCode})` : ""}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <p className="font-semibold text-slate-700">Dispatched</p>
                <p className="text-slate-600">
                  {formatDateTime(detail.dispatchedAt)}
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">Delivered</p>
                <p className="text-slate-600">
                  {formatDateTime(detail.deliveredAt)}
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">Confirmed</p>
                <p className="text-slate-600">
                  {formatDateTime(detail.confirmedAt)}
                </p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.items.map((item) => {
                  const unit =
                    item.unitLabel === "PACK"
                      ? "pack"
                      : item.unitLabel === "HEAD"
                        ? "head"
                        : item.unitLabel === "QTY"
                          ? "unit"
                          : "pcs";

                  return (
                    <TableRow key={item._id}>
                      <TableCell className="font-medium">
                        {item.productName}
                        {item.unitLabel === "PACK" && item.packSize > 0 ? (
                          <span className="ml-1 text-xs text-slate-400">
                            ({item.packSize}/pack)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.qty} {unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {confirmed ? `${item.receivedQty} ${unit}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {confirmed && item.varianceQty > 0 ? (
                          <span className="font-semibold text-amber-600">
                            -{item.varianceQty} {unit}
                          </span>
                        ) : confirmed ? (
                          0
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <ItemStatusBadge status={item.itemStatus} />
                      </TableCell>
                      <TableCell className="max-w-48 text-xs text-slate-600">
                        {item.remarks || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {detail.remarks ? (
              <div>
                <p className="font-semibold text-slate-700">
                  Main branch remarks
                </p>
                <p className="text-slate-600">{detail.remarks}</p>
              </div>
            ) : null}

            {detail.outletRemarks ? (
              <div>
                <p className="font-semibold text-slate-700">Outlet remarks</p>
                <p className="text-slate-600">{detail.outletRemarks}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
