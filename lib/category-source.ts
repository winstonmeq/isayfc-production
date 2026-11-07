export const CATEGORY_SOURCES = ["BODEGA", "GROCERY", "OUTLET", "SHARED"] as const;
export type CategorySource = (typeof CATEGORY_SOURCES)[number];
export const CATEGORY_SOURCE_OPTIONS = [
  { value: "BODEGA", label: "Bodega" },
  { value: "GROCERY", label: "Grocery" },
  { value: "OUTLET", label: "Outlet" },
  { value: "SHARED", label: "Shared / All Sources" },
] as const;
export function isCategorySource(value: unknown): value is CategorySource {
  return typeof value === "string" && (CATEGORY_SOURCES as readonly string[]).includes(value);
}
export function categorySource(value: unknown): CategorySource {
  return isCategorySource(value) ? value : "SHARED";
}
export function categoryMatchesSource(value: unknown, inventorySource: "BODEGA" | "GROCERY" | "OUTLET") {
  return value === "SHARED" || value === inventorySource;
}
/** Missing legacy sources are not implicitly shared in product dropdowns. */
export function categorySourceScope(source: CategorySource) {
  return { source: { $in: source === "SHARED" ? ["SHARED"] : [source, "SHARED"] } };
}
export function categorySourceLabel(value: unknown) {
  if (!isCategorySource(value)) return "Unassigned — set Source";
  return CATEGORY_SOURCE_OPTIONS.find((option) => option.value === categorySource(value))!.label;
}
