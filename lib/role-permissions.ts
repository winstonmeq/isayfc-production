export const ROLE_PERMISSION_GROUPS = [
  {
    group: "Dashboard",
    permissions: [{ key: "dashboard.view", label: "View Dashboard" }],
  },
  {
    group: "Outlet Setup & Deliveries",
    permissions: [
      { key: "outlets.view", label: "View Outlets" },
      { key: "outlets.manage", label: "Manage Outlets" },
      { key: "outlet-inventory.view", label: "View Outlet Inventory" },
      { key: "outlet-inventory.manage", label: "Manage Outlet Inventory" },
      { key: "stock-transfers.view", label: "View Outlet Deliveries" },
      { key: "stock-transfers.manage", label: "Manage Outlet Deliveries (Main Branch)" },
      { key: "stock-transfers.confirm", label: "Confirm Incoming Deliveries (Outlet)" },
      { key: "outlet-repack.manage", label: "Outlet Production / Mixing (Web & Mobile)" },
      { key: "cash.manage", label: "Mobile Cash Shifts" },
    ],
  },
  {
    group: "Master Data",
    permissions: [
      { key: "customers.view", label: "View Customers" },
      { key: "customers.manage", label: "Manage Customers" },
      { key: "suppliers.view", label: "View Suppliers" },
      { key: "suppliers.manage", label: "Manage Suppliers" },
      { key: "categories.view", label: "View Categories" },
      { key: "categories.manage", label: "Manage Categories" },
      { key: "products.view", label: "View Grocery Products & Product Units" },
      { key: "products.manage", label: "Manage Grocery Products, Units & Approve Selling Prices" },
      { key: "bodega-products.view", label: "View Bodega Products" },
      { key: "bodega-products.manage", label: "Manage Bodega Products" },
    ],
  },
  {
    group: "Purchasing / Stock-In",
    permissions: [
      { key: "purchase-items.view", label: "View Purchase Items" },
      { key: "purchase-items.manage", label: "Manage Purchase Items" },
      { key: "supplier-deliveries.view", label: "View Supplier Deliveries" },
      { key: "supplier-deliveries.manage", label: "Manage Supplier Deliveries" },
      { key: "supplier-invoices.view", label: "View Supplier Invoices" },
      { key: "supplier-invoices.manage", label: "Manage Supplier Invoices" },
    ],
  },
  {
    group: "Production",
    permissions: [
      { key: "slicing.view", label: "Slicing, Main Production Batches & Chicken Reconciliation" },
      { key: "slicing.manage", label: "Manage Slicing & Main Production Batches" },
      { key: "standard-packing.view", label: "View Standard PCS & Packs" },
      { key: "standard-packing.manage", label: "Manage Standard PCS & Packs" },
    ],
  },
  {
    group: "Sales / Customer Deliveries",
    permissions: [
      { key: "sales.view", label: "View Sales" },
      {
        key: "sales.manage",
        label: "Create Main Sales (Including Outlet Customers)",
      },
      { key: "sales-lines.view", label: "View Sales Per Item" },
      { key: "discounts.view", label: "View Discounts" },
      { key: "discounts.manage", label: "Manage Discount Setup" },
      { key: "customer-deliveries.view", label: "View Customer Deliveries" },
      { key: "customer-deliveries.manage", label: "Manage Customer Deliveries" },
    ],
  },
  {
    group: "Outlet Operations (POS)",
    permissions: [
      { key: "pos.view", label: "View Outlet Daily Sales and Operations" },
      { key: "pos.manage", label: "Create Outlet Sales" },
      { key: "pos.expenses.manage", label: "Create / Edit / Void Outlet Expenses & Stock Usage" },
      { key: "pos.menu.manage", label: "Create / Edit / Remove Outlet Menu Products" },
      { key: "pos.deductions.manage", label: "Deduct Outlet Stock" },
      { key: "pos.all-outlets", label: "Operate All Outlets / Select Store (Supervisors Only)" },
      { key: "reports.outlet-sales", label: "Outlet Sales & Profit Report (All Outlets)" },
      { key: "reports.outlet-comparison", label: "Outlet Comparison (All Outlets)" },
      { key: "payments.outlet-collections", label: "Outlet Collections Report (All Outlets)" },
    ],
  },
  {
    group: "Payment",
    permissions: [
      { key: "payments.view", label: "Payment History & Customer Balances" },
      { key: "payments.manage", label: "Record / Void Customer Payments" },
      { key: "accounts-payable.view", label: "Accounts Payable & Supplier Payment History" },
      { key: "accounts-payable.manage", label: "Manage Accounts Payable" },
    ],
  },
  {
    group: "Expenses",
    permissions: [
      { key: "expenses-bodega.view", label: "View Business Expenses" },
      { key: "expenses-bodega.manage", label: "Manage Business Expenses & Expense Types" },
    ],
  },
  {
    group: "Inventory",
    permissions: [
      { key: "inventory.view", label: "View Inventory" },
      { key: "inventory.manage", label: "Manage Inventory" },
      { key: "inventory-adjustments.view", label: "View Inventory Adjustments" },
      { key: "inventory-adjustments.manage", label: "Post Inventory Adjustments" },
      { key: "customer-returns.approve", label: "Approve / Reject Main Customer Returns" },
    ],
  },
  {
    group: "Main & Overall Reports",
    permissions: [
      { key: "reports.print", label: "Print Main & Outlet Reports" },
      { key: "reports.sales", label: "Main Sales Report" },
      { key: "reports.inventory", label: "Inventory Report" },
      { key: "reports.payments", label: "Payment Report" },
      { key: "reports.profit", label: "Main Income Statement & Profit Reports" },
      { key: "reports.overall", label: "Overall Business Report — Main + All Outlets" },
    ],
  },
  {
    group: "System",
    permissions: [
      { key: "corrections.view", label: "View Correction Register" },
      { key: "corrections.approve", label: "Approve Corrections" },
      { key: "users.view", label: "View Users" },
      { key: "users.manage", label: "Manage Users" },
      { key: "roles.view", label: "View Roles" },
      { key: "roles.manage", label: "Manage Roles" },
      { key: "audit-logs.view", label: "View Audit Logs" },
    ],
  },
] as const;

export const ROLE_PERMISSION_KEYS = ROLE_PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.key)
);

// Retired permissions remain type-compatible with old endpoints, but cannot be assigned.
export type RolePermission = (typeof ROLE_PERMISSION_KEYS)[number] | "stock-counts.view" | "stock-counts.manage" | "customer-inventory.view" | "admin.login-history";

export function isValidRolePermission(value: string) {
  return (ROLE_PERMISSION_KEYS as readonly string[]).includes(value);
}

/** Write access includes the matching page; never grants unrelated modules. */
export function normalizeRolePermissions(input: readonly string[]): RolePermission[] {
  const migrated = input.map((key) => key === "activity-logs.view" ? "audit-logs.view" : key);
  const permissions = new Set<RolePermission>(migrated.filter(isValidRolePermission) as RolePermission[]);
  for (const permission of [...permissions]) {
    if (["pos.expenses.manage", "pos.menu.manage", "pos.deductions.manage", "outlet-repack.manage", "stock-transfers.confirm", "outlet-inventory.manage"].includes(permission)) permissions.add("pos.view");
    if (permission === "customer-returns.approve") permissions.add("inventory-adjustments.view");
    if (permission.endsWith(".manage")) {
      const view = permission.replace(/\.manage$/, ".view");
      if (isValidRolePermission(view)) permissions.add(view as RolePermission);
    }
  }
  return [...permissions];
}

export const ROLE_PRESETS = [
  { name: "Outlet Cashier", permissions: ["pos.view", "pos.manage", "pos.expenses.manage", "stock-transfers.confirm", "outlet-repack.manage", "reports.print", "cash.manage"] },
  { name: "Outlet Sales Manager", permissions: ["pos.view", "pos.manage", "pos.expenses.manage", "pos.menu.manage", "outlet-repack.manage", "stock-transfers.confirm", "reports.print", "pos.all-outlets", "reports.outlet-sales", "reports.outlet-comparison", "payments.outlet-collections"] },
  { name: "Main Sales Clerk", permissions: ["sales.view", "sales.manage", "sales-lines.view", "customers.view", "discounts.view", "stock-transfers.view"] },
  { name: "Payment Clerk", permissions: ["payments.view", "payments.manage", "accounts-payable.view", "accounts-payable.manage", "supplier-invoices.view"] },
  { name: "Owner Report Viewer", permissions: ["reports.overall", "reports.sales", "reports.profit", "reports.inventory", "reports.payments", "reports.outlet-sales", "reports.outlet-comparison", "payments.outlet-collections"] },
] as const;

export function roleNeedsOutlet(roleName: string, permissions: readonly string[]) {
  // Operational permissions alone do not make a supervisor a store cashier.
  // Keep assignment mandatory for cashier roles without broadening store access.
  void permissions;
  return /\bCASHIER\b/.test(roleName.trim().toUpperCase());
}

/** Scope follows explicit permissions, not the spelling of a custom manager role. */
export function canSelectPosOutlets(access: { role: string; roleName: string; permissions: readonly string[] }) {
  return access.role === "ADMIN" || (
    !roleNeedsOutlet(access.roleName, access.permissions) && access.role !== "CASHIER" &&
    access.permissions.includes("pos.all-outlets") &&
    access.permissions.some((key) => key === "pos.view" || key === "pos.manage")
  );
}

/** Shared store boundary for outlet reads and mutations; never bypass cashier scope. */
export function canAccessPosOutlet(
  access: { role: string; roleName: string; permissions: readonly string[] },
  assignedOutletId: string,
  requestedOutletId: string,
) {
  return Boolean(requestedOutletId) && (
    canSelectPosOutlets(access) || requestedOutletId === assignedOutletId
  );
}

/** The selected role, not a stale or forged form.role value, defines legacy access. */
export function legacyRoleForSelection(name: string): "ADMIN" | "MANAGER" | "CASHIER" | "STAFF" | "USER" {
  const role = name.toUpperCase();
  return role === "ADMIN" || role === "MANAGER" || role === "CASHIER" || role === "STAFF" ? role : "USER";
}

// "Any of" permission sets for shared lookup endpoints (GET only).
// These reference lists are consumed by forms on several different pages,
// so any permission that grants access to one of those pages also grants
// read access to the lookup. Write operations always require the strict
// single permission for that resource.

export const CUSTOMER_LOOKUP_PERMISSIONS: RolePermission[] = [
  "customers.view",
  "customers.manage",
  "sales.view",
  "sales.manage",
  "customer-inventory.view",
  "payments.view",
  "payments.manage",
];

export const CATEGORY_LOOKUP_PERMISSIONS: RolePermission[] = [
  "categories.view",
  "categories.manage",
  "products.view",
  "products.manage",
  "bodega-products.view",
  "bodega-products.manage",
  "supplier-deliveries.view",
  "supplier-deliveries.manage",
  "inventory.view",
  "inventory.manage",
  "sales-lines.view",
  "stock-counts.view",
  "stock-counts.manage",
  "inventory-adjustments.view",
  "inventory-adjustments.manage",
];

export const BODEGA_PRODUCT_LOOKUP_PERMISSIONS: RolePermission[] = [
  "bodega-products.view",
  "bodega-products.manage",
  "stock-transfers.view",
  "stock-transfers.manage",
  "supplier-deliveries.view",
  "supplier-deliveries.manage",
  "standard-packing.view",
  "standard-packing.manage",
  "slicing.view",
  "slicing.manage",
  "outlet-inventory.view",
  "outlet-inventory.manage",
  "sales-lines.view",
  "sales.view",
  "sales.manage",
  "stock-counts.view",
  "stock-counts.manage",
  "inventory-adjustments.view",
  "inventory-adjustments.manage",
];

export const PRODUCT_LOOKUP_PERMISSIONS: RolePermission[] = [
  "products.view",
  "products.manage",
  "stock-transfers.view",
  "stock-transfers.manage",
  "purchase-items.view",
  "purchase-items.manage",
  "inventory.view",
  "inventory.manage",
  "sales.view",
  "sales.manage",
  "stock-counts.view",
  "stock-counts.manage",
  "inventory-adjustments.view",
  "inventory-adjustments.manage",
];

export const SUPPLIER_LOOKUP_PERMISSIONS: RolePermission[] = [
  "purchase-items.view",
  "purchase-items.manage",
  "suppliers.view",
  "suppliers.manage",
  "supplier-deliveries.view",
  "supplier-deliveries.manage",
  "supplier-invoices.view",
  "supplier-invoices.manage",
  "accounts-payable.view",
  "accounts-payable.manage",
];
