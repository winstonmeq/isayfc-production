// components/app-shell/nav-config.ts
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  ScrollText,
  Send,
  BarChart3,
  Building2,
  Boxes,
  ClipboardList,
  Clock,
  CreditCard,
  Gauge,
  LayoutDashboard,
  Package,
  PackagePlus,
  ReceiptText,
  Scissors,
  ShieldCheck,
  ShoppingBasket,
  ShoppingCart,
  Tags,
  Truck,
  UserRoundCog,
  Users,
  WalletCards,
  Warehouse,
} from "lucide-react";

export type AppNavChild = {
  title: string;
  href: string;
  icon?: LucideIcon;
  permission?: string;
};

export type AppNavItem = {
  title: string;
  href?: string;
  icon: LucideIcon;
  permission?: string;
  section?: "Workspace" | "Operations" | "Finance" | "Admin";
  children?: AppNavChild[];
};

export const appNavItems: AppNavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    permission: "dashboard.view",
    section: "Workspace",
  },
  {
    title: "Customers",
    href: "/customers",
    icon: Users,
    permission: "customers.view",
    section: "Workspace",
  },
  {
    title: "Suppliers",
    href: "/suppliers",
    icon: Truck,
    permission: "suppliers.view",
    section: "Workspace",
  },
  {
    title: "Outlets",
    href: "/outlets",
    icon: Building2,
    permission: "outlets.view",
    section: "Workspace",
  },
  {
    title: "Categories",
    href: "/categories",
    icon: Tags,
    permission: "categories.view",
    section: "Workspace",
  },
  {
    title: "Products",
    icon: Package,
    permission: "products.view",
    section: "Workspace",
    children: [
      {
        title: "Grocery Products",
        href: "/products",
        icon: Package,
        permission: "products.view",
      },
      {
        title: "Bodega Products",
        href: "/bodega-products",
        icon: Boxes,
        permission: "bodega-products.view",
      },
    ],
  },
  {
    title: "Purchase Item",
    href: "/purchase-items",
    icon: PackagePlus,
    permission: "purchase-items.view",
    section: "Operations",
  },
  {
    title: "Deliveries",
    href: "/deliveries",
    icon: Truck,
    permission: "supplier-deliveries.view",
    section: "Operations",
  },
  {
    title: "Slicing",
    icon: Scissors,
    permission: "slicing.view",
    section: "Operations",
    children: [
      {
        title: "Slice History",
        href: "/slicing",
        icon: Clock,
        permission: "slicing.view",
      },
      {
        title: "Add Slicing",
        href: "/slicing/new",
        icon: Scissors,
        permission: "slicing.manage",
      },
      {
        title: "Daily Slicing History",
        href: "/slicing/daily-history",
        icon: ClipboardList,
        permission: "slicing.view",
      },
      {
        title: "Standard PCS & Packs",
        href: "/slicing/standard-packing",
        icon: Boxes,
        permission: "standard-packing.view",
      },
    ],
  },
  {
    title: "Sales",
    icon: ShoppingCart,
    permission: "sales.view",
    section: "Operations",
    children: [
      {
        title: "Sales History",
        href: "/sales/history",
        icon: Clock,
        permission: "sales.view",
      },
      {
        title: "Sell Chicken",
        href: "/sales",
        icon: ShoppingCart,
        permission: "sales.manage",
      },
      {
        title: "Sale Grocery",
        href: "/sales/grocery",
        icon: ShoppingBasket,
        permission: "sales.manage",
      },
      {
        title: "All Sales",
        href: "/sales/all",
        icon: ShoppingCart,
        permission: "sales.manage",
      },
      {
        title: "Sale Per Item",
        href: "/sales/lines",
        icon: ReceiptText,
        permission: "sales-lines.view",
      },
      {
        title: "Stock Transfers",
        href: "/stock-transfers",
        icon: Send,
        permission: "stock-transfers.view",
      },
    ],
  },
  {
    title: "Payments",
    icon: WalletCards,
    permission: "payments.view",
    section: "Finance",
    children: [
      {
        title: "Payment Summary",
        href: "/payments",
        icon: ClipboardList,
        permission: "payments.view",
      },
      {
        title: "Add Payment",
        href: "/payments/add",
        icon: CreditCard,
        permission: "payments.manage",
      },
      {
        title: "Payment History",
        href: "/payments/history",
        icon: Clock,
        permission: "payments.view",
      },
    ],
  },
  {
    title: "Outlet Profit",
    href: "/outlet-summary",
    icon: BarChart3,
    permission: "outlets.view",
    section: "Finance",
  },
  {
    title: "Chicken Slicing Profit",
    href: "/profit/chicken-slicing",
    icon: BarChart3,
    permission: "reports.profit",
    section: "Finance",
  },
  {
    title: "Product/Grocery Profit",
    href: "/profit/products",
    icon: BarChart3,
    permission: "reports.profit",
    section: "Finance",
  },
  {
    title: "Business Expenses",
    href: "/expenses-bodega",
    icon: ReceiptText,
    permission: "expenses-bodega.view",
    section: "Finance",
  },
  {
    title: "Inventory",
    icon: Boxes,
    permission: "inventory.view",
    section: "Finance",
    children: [
      {
        title: "Bodega Stock Movement",
        href: "/inventory/bodega",
        icon: ArrowLeftRight,
        permission: "inventory.view",
      },
      {
        title: "Grocery/Product Inventory",
        href: "/inventory/products",
        icon: Package,
        permission: "inventory.view",
      },
      {
        title: "Outlet Inventory",
        href: "/outlet-inventory",
        icon: Warehouse,
        permission: "outlet-inventory.view",
      },
    ],
  },
  {
    title: "Reports",
    icon: BarChart3,
    permission: "reports.sales",
    section: "Finance",
    children: [
      {
        title: "Gross Sales & Profitability",
        href: "/reports/gross-sales",
        icon: BarChart3,
        permission: "reports.profit",
      },
      {
        title: "Sales Report",
        href: "/reports/sales",
        icon: BarChart3,
        permission: "reports.sales",
      },
      {
        title: "Inventory Report",
        href: "/reports/inventory",
        icon: Boxes,
        permission: "reports.inventory",
      },
      {
        title: "Inventory Movements",
        href: "/reports/inventory-movements",
        icon: ArrowLeftRight,
        permission: "reports.inventory",
      },
      {
        title: "Inventory Reconciliation",
        href: "/reports/inventory-reconciliation",
        icon: ShieldCheck,
        permission: "reports.inventory",
      },
      {
        title: "Payment Report",
        href: "/reports/payments",
        icon: CreditCard,
        permission: "reports.payments",
      },
      {
        title: "Profit Report",
        href: "/reports/profit",
        icon: Gauge,
        permission: "reports.profit",
      },
      {
        title: "Product Profit Recovery",
        href: "/reports/product-profits",
        icon: BarChart3,
        permission: "reports.profit",
      },
    ],
  },
  {
    title: "Users",
    href: "/users",
    icon: UserRoundCog,
    permission: "users.view",
    section: "Admin",
  },
  {
    title: "Roles",
    href: "/roles",
    icon: ShieldCheck,
    permission: "roles.view",
    section: "Admin",
  },
  {
    title: "Audit Logs",
    href: "/audit-logs",
    icon: ScrollText,
    permission: "audit-logs.view",
    section: "Admin",
  },
  {
    title: "Correction Register",
    href: "/corrections",
    icon: ScrollText,
    permission: "audit-logs.view",
    section: "Admin",
  },
];
