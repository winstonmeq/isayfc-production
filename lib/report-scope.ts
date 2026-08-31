export type MainSalesReportSource = "CHICKEN" | "BODEGA" | null;

export function getMainSalesReportSource(value: unknown): MainSalesReportSource {
  const source = String(value || "").trim().toUpperCase();
  return source === "CHICKEN" || source === "BODEGA" ? source : null;
}
