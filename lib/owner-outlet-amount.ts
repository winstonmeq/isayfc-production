/** Informational subset of outstanding balance; never an expense or deduction. */
export function ownerOutletAmount(outletId: unknown, outstanding: number) {
  const id = outletId == null ? "" : String(outletId).trim();
  return id && id !== "NONE" && Number.isFinite(outstanding) ? Math.max(outstanding, 0) : 0;
}
