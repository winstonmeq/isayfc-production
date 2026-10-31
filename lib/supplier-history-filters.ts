import { isValidObjectId } from "mongoose";

export function supplierHistoryFilters(params: URLSearchParams, dateField: string) {
  const filter: Record<string, unknown> = {};
  const supplier = params.get("supplierId");
  if (supplier) {
    if (!isValidObjectId(supplier)) throw new Error("Invalid supplier.");
    filter.supplierId = supplier;
  }
  const from = params.get("dateFrom"), to = params.get("dateTo");
  for (const date of [from, to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error("Invalid date.");
  if (from && to && from > to) throw new Error("Date From must not be after Date To.");
  if (from || to) filter[dateField] = { ...(from ? { $gte: new Date(`${from}T00:00:00+08:00`) } : {}), ...(to ? { $lt: new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000) } : {}) };
  const page = Math.max(1, Math.trunc(Number(params.get("page")) || 1));
  const limit = 25;
  return { filter, page, limit };
}
