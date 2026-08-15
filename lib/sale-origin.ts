export type SaleOrigin =
  | "OUTLET"
  | "CHICKEN"
  | "GROCERY"
  | "CHICKEN + GROCERY";

export function getSaleOrigin(sale: {
  outletId?: unknown;
  channel?: unknown;
  receiptNumber?: unknown;
  remarks?: unknown;
  source?: unknown;
}): SaleOrigin {
  const receipt = String(sale.receiptNumber || "").toUpperCase();
  const remarks = String(sale.remarks || "").toUpperCase();
  const channel = String(sale.channel || "").toUpperCase();

  if (
    sale.outletId ||
    channel === "MOBILE" ||
    receipt.startsWith("MOB-") ||
    remarks.includes("MOBILE SALE OUTLET:")
  ) {
    return "OUTLET";
  }

  const source = String(sale.source || "BODEGA").toUpperCase();
  if (source === "CHICKEN") return "CHICKEN";
  if (source === "MIXED") return "CHICKEN + GROCERY";
  return "GROCERY";
}

export function getOutletCode(sale: { outletId?: unknown }): string {
  const outlet = sale.outletId as
    | { code?: unknown; name?: unknown }
    | null
    | undefined;

  return String(outlet?.code || outlet?.name || "")
    .trim()
    .toUpperCase();
}

export function getSaleSourceLabel(sale: {
  outletId?: unknown;
  channel?: unknown;
  receiptNumber?: unknown;
  remarks?: unknown;
  source?: unknown;
}): string {
  const origin = getSaleOrigin(sale);
  if (origin !== "OUTLET") return origin;

  const outletCode = getOutletCode(sale);
  return outletCode ? `OUTLET-${outletCode}` : "OUTLET";
}
