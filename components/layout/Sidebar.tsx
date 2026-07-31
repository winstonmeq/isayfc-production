// // components/layout/Sidebar.tsx
// "use client";

// import Link from "next/link";
// import { usePathname } from "next/navigation";
// import {
//   Boxes,
//   ClipboardList,
//   Gauge,
//   HandCoins,
//   LayoutGrid,
//   Package,
//   ReceiptText,
//   Scissors,
//   ShoppingCart,
//   Truck,
//   Users,
//   Clock,
//   ShoppingBasket,
//   UserRoundCog,
//   WalletCards,
// } from "lucide-react";
// import { ArrowLeftRight } from "lucide-react";
// import { cn } from "@/lib/utils";

// const navigationItems = [
//   {
//     title: "Dashboard",
//     href: "/dashboard",
//     icon: Gauge,
//   },
//   {
//     title: "Customer",
//     href: "/customers",
//     icon: Users,
//   },
//   {
//     title: "Supplier",
//     href: "/suppliers",
//     icon: Truck,
//   },
//   {
//     title: "Category",
//     href: "/categories",
//     icon: LayoutGrid,
//   },
//   {
//     title: "Products",
//     href: "/products",
//     icon: Package,
//   },
//   {
//     title: "Bodega Products",
//     href: "/bodega-products",
//     icon: Boxes,
//   },

//     {
//     title: "Purchase Items",
//     href: "/purchase-items",
//     icon: ReceiptText,
//   },


//   {
//     title: "Deliveries",
//     href: "/deliveries",
//     icon: Truck,
//   },
//   {
//     title: "Slicing",
//     href: "/slicing",
//     icon: Scissors,
//   },
// {
//   title: "Standard PCS & Packs",
//   href: "/standard-packing",
//   icon: Boxes,
// },
//  {
//     title: "Payments",
//     href: "/payments",
//     icon: WalletCards,
//   },
//   {
//   title: "Payment History",
//   href: "/payments/history",
//   icon: WalletCards,
//   },
//   {
//     title: "Add Payment",
//     href: "/payments/add",
//     icon: WalletCards,
//   },  
  
//   {
//   title: "Whole Chicken Movement",
//   href: "/inventory/whole-chicken",
//   icon: ArrowLeftRight,
// },
// {
//   title: "Bodega Stock Movement",
//   href: "/inventory/bodega",
//   icon: ArrowLeftRight,
// },

//   {
//     title: "Expenses Bodega",
//     href: "/bodega-expenses",
//     icon: ReceiptText,
//   },
//   {
//   title: "Sales",
//   href: "/sales",
//   icon: ShoppingCart,
// },
// {
//   title: "Sale Grocery",
//   href: "/sales/grocery",
//   icon: ShoppingBasket,
// },
// {
//   title: "Sales History",
//   href: "/sales/history",
//   icon: Clock,
// },
// {
//   title: "Sale Per Item",
//   href: "/sales/lines",
//   icon: ShoppingCart,
// },
//   {
//     title: "Profit",
//     href: "/profit",
//     icon: HandCoins,
//   },
//   {
//     title: "Users",
//     href: "/users",
//     icon: UserRoundCog,
//   },
// ];

// export function Sidebar() {
//   const pathname = usePathname();

//   return (
//     <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r bg-gradient-to-b from-red-600 via-orange-500 to-yellow-400 lg:block">
//       <div className="flex h-24 items-center px-6">
//         <div className="rounded-xl bg-white px-4 py-3 shadow">
//           <p className="text-2xl font-black leading-none text-red-600">
//             ISA
//           </p>
//           <p className="text-xs font-bold text-yellow-600">
//             Fried Chicken
//           </p>
//         </div>
//       </div>

//       <nav className="space-y-1 px-4 pb-6">
//         {navigationItems.map((item) => {
//           const isActive =
//             pathname === item.href || pathname.startsWith(`${item.href}/`);

//           const Icon = item.icon;

//           return (
//             <Link
//               key={item.href}
//               href={item.href}
//               className={cn(
//                 "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-black transition hover:bg-white/25",
//                 isActive && "bg-white/30 text-white shadow-sm"
//               )}
//             >
//               <Icon className="h-5 w-5" />
//               {item.title}
//             </Link>
//           );
//         })}
//       </nav>
//     </aside>
//   );
// }
