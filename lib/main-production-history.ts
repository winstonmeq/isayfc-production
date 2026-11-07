import { escapeRegex } from "@/lib/crud-utils";

export function mainProductionHistoryQuery(params: URLSearchParams) {
  const from = params.get("from") || "", to = params.get("to") || "";
  const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
  if ((from && !valid(from)) || (to && !valid(to)) || (from && to && from > to)) throw new Error("Select a valid date range.");
  const search = (params.get("search") || "").trim().slice(0, 160), status = params.get("status") || "ALL";
  if (!["ALL", "POSTED", "REVERSED"].includes(status)) throw new Error("Select a valid status.");
  const rawPage = Number(params.get("page") || 1), rawSize = Number(params.get("size") || 25);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1, size = [10, 25, 50, 100].includes(rawSize) ? rawSize : 25;
  const regex = new RegExp(escapeRegex(search), "i");
  return { page, size, filter: {
    ...(status !== "ALL" ? { status } : {}),
    ...(search ? { $or: [{ batchNumber: regex }, { outputName: regex }, { "ingredients.productName": regex }] } : {}),
    ...(from || to ? { productionDate: { ...(from ? { $gte: new Date(`${from}T00:00:00+08:00`) } : {}), ...(to ? { $lt: new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000) } : {}) } } : {}),
  } };
}
