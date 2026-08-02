export const ROLE_PERMISSION_GROUPS = [
  {
    group: "Dashboard",
    permissions: [{ key: "dashboard.view", label: "View Dashboard" }],
  },
  {
    group: "Outlets",
    permissions: [
      { key: "outlets.view", label: "View Outlets" },
      { key: "outlets.manage", label: "Manage Outlets" },
      { key: "outlet-inventory.view", label: "View Outlet Inventory" },
      { key: "outlet-inventory.manage", label: "Manage Outlet Inventory" },
      { key: "stock-transfers.view", label: "View Stock Transfers" },
      { key: "stock-transfers.manage", label: "Manage Stock Transfers (Main Branch)" },
      { key: "stock-transfers.confirm", label: "Confirm Incoming Deliveries (Outlet)" },
      { key: "outlet-repack.manage", label: "Repack / Break-Bulk (Outlet)" },
      { key: "cash.manage", label: "Open / Close Cash (Cashier)" },
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
      { key: "products.view", label: "View Products" },
      { key: "products.manage", label: "Manage Products" },
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
    ],
  },
  {
    group: "Production",
    permissions: [
      { key: "slicing.view", label: "View Slicing" },
      { key: "slicing.manage", label: "Manage Slicing" },
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
        label: "Create Sales (All, Chicken, and Grocery)",
      },
      { key: "sales-lines.view", label: "View Sales Per Item" },
      { key: "customer-deliveries.view", label: "View Customer Deliveries" },
      { key: "customer-deliveries.manage", label: "Manage Customer Deliveries" },
      { key: "customer-inventory.view", label: "View Customer Inventory" },
    ],
  },
  {
    group: "Payments",
    permissions: [
      { key: "payments.view", label: "View Payments" },
      { key: "payments.manage", label: "Manage Payments" },
    ],
  },
  {
    group: "Expenses",
    permissions: [
      { key: "expenses-bodega.view", label: "View Business Expenses" },
      { key: "expenses-bodega.manage", label: "Manage Business Expenses" },
    ],
  },
  {
    group: "Inventory",
    permissions: [
      { key: "inventory.view", label: "View Inventory" },
      { key: "inventory.manage", label: "Manage Inventory" },
      { key: "stock-adjustment.manage", label: "Manage Stock Adjustment" },
    ],
  },
  {
    group: "Reports",
    permissions: [
      { key: "reports.sales", label: "Sales Report" },
      { key: "reports.inventory", label: "Inventory Report" },
      { key: "reports.payments", label: "Payment Report" },
      { key: "reports.customer-balance", label: "Customer Balance Report" },
      { key: "reports.product-movement", label: "Product Movement Report" },
      { key: "reports.profit", label: "Profit Reports" },
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
      { key: "activity-logs.view", label: "View Activity Logs" },
      { key: "audit-logs.view", label: "View Audit Logs" },
      { key: "settings.manage", label: "Manage Settings" },
    ],
  },
] as const;

export const ROLE_PERMISSION_KEYS = ROLE_PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.key)
);

export type RolePermission = (typeof ROLE_PERMISSION_KEYS)[number];

export function isValidRolePermission(value: string) {
  return ROLE_PERMISSION_KEYS.includes(value as RolePermission);
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
];

export const PRODUCT_LOOKUP_PERMISSIONS: RolePermission[] = [
  "products.view",
  "products.manage",
  "purchase-items.view",
  "purchase-items.manage",
  "inventory.view",
  "inventory.manage",
  "sales.view",
  "sales.manage",
];

export const SUPPLIER_LOOKUP_PERMISSIONS: RolePermission[] = [
  "suppliers.view",
  "suppliers.manage",
  "supplier-deliveries.view",
  "supplier-deliveries.manage",
];
