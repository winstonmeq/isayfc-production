import { normalizeRolePermissions, type RolePermission } from "./role-permissions";

type PageRule = { path: string; permission: RolePermission; exact?: boolean };
export const PAGE_ACCESS_RULES: PageRule[] = [
  { path: "/login-history", permission: "admin.login-history" },
  { path: "/pos/reports", permission: "reports.inventory" },
  { path: "/pos", permission: "pos.view" },
  { path: "/dashboard", permission: "dashboard.view" },
  { path: "/outlets", permission: "outlets.view" },
  { path: "/outlet-inventory", permission: "outlet-inventory.view" },
  { path: "/outlet-menu", permission: "outlets.view" },
  { path: "/outlet-summary", permission: "reports.outlet-comparison" },
  { path: "/customers", permission: "customers.view" },
  { path: "/customer-deliveries", permission: "customer-deliveries.view" },
  { path: "/suppliers", permission: "suppliers.view" },
  { path: "/categories", permission: "categories.view" },
  { path: "/products", permission: "products.view" },
  { path: "/units", permission: "products.view" },
  { path: "/bodega-products", permission: "bodega-products.view" },
  { path: "/purchase-items", permission: "purchase-items.view" },
  { path: "/deliveries", permission: "supplier-deliveries.view" },
  { path: "/supplier-invoices", permission: "supplier-invoices.view" },
  { path: "/accounts-payable", permission: "accounts-payable.view" },
  { path: "/supplier-payment-history", permission: "accounts-payable.view" },
  { path: "/slicing/new", permission: "slicing.manage" },
  { path: "/slicing/standard-packing", permission: "standard-packing.view" },
  { path: "/slicing", permission: "slicing.view" },
  { path: "/sales/discounts", permission: "discounts.manage" },
  { path: "/sales/history", permission: "sales.view" },
  { path: "/sales/lines", permission: "sales-lines.view" },
  { path: "/sales/all", permission: "sales.manage" },
  { path: "/sales/grocery", permission: "sales.manage" },
  { path: "/sales", permission: "sales.manage", exact: true },
  { path: "/payments/pos-collections", permission: "payments.outlet-collections" },
  { path: "/payments/add", permission: "payments.manage" },
  { path: "/payments", permission: "payments.view" },
  { path: "/inventory-adjustments", permission: "inventory-adjustments.view" },
  { path: "/stock-counts", permission: "stock-counts.view" },
  { path: "/inventory", permission: "inventory.view" },
  { path: "/reports/outlet-pos", permission: "reports.outlet-sales" },
  { path: "/reports/overall", permission: "reports.overall" },
  { path: "/reports/internal-outlets", permission: "reports.overall" },
  { path: "/reports/chicken-slicing", permission: "reports.profit" },
  { path: "/profit/chicken-slicing", permission: "reports.profit" },
  { path: "/reports/sales", permission: "reports.sales" },
  { path: "/reports/inventory", permission: "reports.inventory" },
  { path: "/reports/inventory-movements", permission: "reports.inventory" },
  { path: "/reports/inventory-reconciliation", permission: "reports.inventory" },
  { path: "/reports/monthly-inventory", permission: "reports.inventory" },
  { path: "/reports/payments", permission: "reports.payments" },
  { path: "/reports/gross-sales", permission: "reports.profit" },
  { path: "/reports/profit", permission: "reports.profit" },
  { path: "/users", permission: "users.view" },
  { path: "/roles", permission: "roles.view" },
  { path: "/expenses-bodega", permission: "expenses-bodega.view" },
  { path: "/audit-logs", permission: "audit-logs.view" },
  { path: "/corrections", permission: "corrections.view" },
  { path: "/stock-transfers", permission: "stock-transfers.view" },
];

export const MODULE_SHELLS = ["/workspace", "/operations", "/finance", "/admin"];
export function requiredPagePermission(pathname: string, module?: string | null) {
  const target = MODULE_SHELLS.includes(pathname) && module ? module : pathname;
  const path = target.replace(/\/$/, "");
  const rule = [...PAGE_ACCESS_RULES].sort((a, b) => b.path.length - a.path.length)
    .find((item) => path === item.path || (!item.exact && path.startsWith(`${item.path}/`)));
  return rule?.permission ?? null;
}

export function userLandingPage(permissions: readonly string[], admin = false, callback?: string | null) {
  const allowed = normalizeRolePermissions(permissions);
  if (callback?.startsWith("/")) {
    const url = new URL(callback, "https://local.invalid");
    const required = requiredPagePermission(url.pathname, url.searchParams.get("module"));
    if (url.origin === "https://local.invalid" && required && (admin || allowed.includes(required))) return `${url.pathname}${url.search}`;
  }
  if (admin) return "/dashboard";
  const preferred = ["/dashboard", "/pos", "/reports/overall", "/sales/history", "/sales/all", "/payments/history", "/accounts-payable", "/supplier-invoices", "/deliveries", "/purchase-items", "/slicing", "/inventory/bodega", "/inventory-adjustments", "/reports/sales", "/reports/profit", "/reports/inventory", "/reports/payments", "/reports/outlet-pos", "/outlet-summary", "/payments/pos-collections", "/users", "/roles"];
  return [...preferred, ...PAGE_ACCESS_RULES.map((rule) => rule.path)].find((path) => {
    const permission = requiredPagePermission(path); return permission && allowed.includes(permission);
  }) || "/unauthorized";
}
