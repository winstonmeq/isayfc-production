// Legacy URLs remain valid, but these modules belong to Outlet Operations.
export const OUTLET_ROUTES = ["/pos", "/outlet-menu", "/outlet-inventory", "/outlet-summary", "/reports/outlet-pos", "/payments/pos-collections"];

export function isOutletRoute(pathname: string, selectedModule = "") {
  const route = selectedModule || pathname;
  return OUTLET_ROUTES.some((href) => route === href || route.startsWith(`${href}/`));
}

export function inventoryReportScope(value: unknown): "MAIN" | "OUTLET" {
  return value === "OUTLET" ? "OUTLET" : "MAIN";
}

export function belongsToInventoryScope(source: string, scope: "MAIN" | "OUTLET") {
  return scope === "OUTLET" ? source === "OUTLET" : source !== "OUTLET";
}
