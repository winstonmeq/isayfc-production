export type MainExpenseCategory = "GROCERY" | "BODEGA";

export function isMainExpenseCategory(value: unknown): value is MainExpenseCategory {
  const category = String(value || "").trim().toUpperCase();
  return category === "GROCERY" || category === "BODEGA";
}
