import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { cleanString, escapeRegex } from "@/lib/crud-utils";
import CustomerModel from "@/models/Customer";
import SaleModel from "@/models/Sale";
import { nonCollectibleSaleClauses } from "@/lib/main-payment-policy";

export const runtime = "nodejs";

type CustomerBalance = {
  _id: unknown;
  totalBalance: number;
  unpaidSales: number;
};

function toPositiveLimit(value: string | null, fallback = 100) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), 1000);
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("payments.view");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const search = cleanString(searchParams.get("search"));
  const limit = toPositiveLimit(searchParams.get("limit"));
  const onlyWithBalance = cleanString(searchParams.get("withBalance")).toLowerCase() === "true";

  const customerFilter: Record<string, unknown> = {
    isActive: true,
    type: { $in: ["SALE", "BOTH"] },
    outletId: null,
  };

  if (search) {
    customerFilter.name = { $regex: escapeRegex(search), $options: "i" };
  }

  const [customers, balances] = await Promise.all([
    CustomerModel.find(customerFilter)
      .select("name email phone address type")
      .sort({ name: 1 })
      .limit(limit)
      .lean(),
    SaleModel.aggregate<CustomerBalance>([
      {
        $match: {
          isVoided: false,
          fulfillmentStatus: { $ne: "PENDING" },
          $nor: nonCollectibleSaleClauses(),
          balance: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: "$customerId",
          totalBalance: { $sum: "$balance" },
          unpaidSales: { $sum: 1 },
        },
      },
    ]),
  ]);

  const balanceMap = new Map(
    balances.map((item) => [
      String(item._id),
      {
        totalBalance: Number(item.totalBalance || 0),
        unpaidSales: Number(item.unpaidSales || 0),
      },
    ])
  );

  const data = customers
    .map((customer: any) => {
      const customerId = customer._id.toString();
      const balanceInfo = balanceMap.get(customerId) || {
        totalBalance: 0,
        unpaidSales: 0,
      };

      return {
        _id: customerId,
        name: customer.name || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        type: customer.type || "SALE",
        totalBalance: balanceInfo.totalBalance,
        unpaidSales: balanceInfo.unpaidSales,
      };
    })
    .filter((customer) => !onlyWithBalance || customer.totalBalance > 0);

  return NextResponse.json({
    success: true,
    data,
  });
}
