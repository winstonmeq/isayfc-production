import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { requiredPagePermission, MODULE_SHELLS } from "@/lib/page-access";
import { normalizeRolePermissions } from "@/lib/role-permissions";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const required = requiredPagePermission(pathname, request.nextUrl.searchParams.get("module"));
  if (!required && !MODULE_SHELLS.includes(pathname)) return NextResponse.next();
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const url = request.nextUrl.clone(); url.pathname = "/login";
    url.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  const permissions = normalizeRolePermissions(Array.isArray(token.permissions) ? token.permissions as string[] : []);
  const admin = token.role === "ADMIN" || token.roleName === "ADMIN";
  if (required && !admin && !permissions.includes(required)) {
    const url = request.nextUrl.clone(); url.pathname = "/unauthorized"; url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/workspace/:path*", "/operations/:path*", "/finance/:path*", "/admin/:path*",
    "/pos/:path*", "/profit/:path*", "/dashboard/:path*", "/outlets/:path*", "/outlet-inventory/:path*",
    "/outlet-menu/:path*", "/outlet-summary/:path*", "/customers/:path*", "/suppliers/:path*", "/categories/:path*",
    "/products/:path*", "/units/:path*", "/bodega-products/:path*", "/purchase-items/:path*", "/deliveries/:path*", "/slicing/:path*",
    "/supplier-invoices/:path*", "/accounts-payable/:path*", "/supplier-payment-history/:path*", "/sales/:path*",
    "/payments/:path*", "/inventory/:path*", "/inventory-adjustments/:path*", "/stock-counts/:path*", "/reports/:path*",
    "/users/:path*", "/roles/:path*", "/expenses-bodega/:path*", "/audit-logs/:path*", "/corrections/:path*", "/stock-transfers/:path*", "/customer-deliveries/:path*",
  ],
};
