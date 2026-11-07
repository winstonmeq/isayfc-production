// Self-contained outlet POS counter routes (no secondary sub-navigation bar).
export const OUTLET_ROUTES = ["/pos", "/outlet-menu"];

export function outletWorkspaceHref(outletId: string) {
  return `/pos/outlets/${encodeURIComponent(outletId)}`;
}

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
