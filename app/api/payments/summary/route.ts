// app/api/payments/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { QueryFilter } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { cleanString, escapeRegex } from "@/lib/crud-utils";
import CustomerModel, { ICustomer } from "@/models/Customer";
import PaymentModel from "@/models/Payment";
import SaleModel from "@/models/Sale";

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(["payments.view", "payments.manage"]);

  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);

  const search = cleanString(searchParams.get("search"));
  const group = cleanString(searchParams.get("group")).toUpperCase();

  const customerFilter: QueryFilter<ICustomer> = {
    isActive: true,
  };

  if (search) {
    customerFilter.name = {
      $regex: escapeRegex(search),
      $options: "i",
    };
  }

  if (group === "SALE") {
    customerFilter.$or = [
      { outletId: { $exists: false } },
      { outletId: null },
    ];
  }

  if (group === "OUTLET") {
    customerFilter.outletId = { $exists: true, $ne: null };
  }

  const customers = await CustomerModel.find(customerFilter)
    .sort({ name: 1 })
    .lean();

  const customerIds = customers.map((customer) => customer._id);

  const [salesSummary, paymentsSummary] = await Promise.all([
    SaleModel.aggregate([
      {
        $match: {
          isVoided: false,
          fulfillmentStatus: { $ne: "PENDING" },
          customerId: {
            $in: customerIds,
          },
        },
      },
      {
        $group: {
          _id: "$customerId",
          sales: {
            $sum: "$totalAmount",
          },
          packs: {
            $sum: "$totalPacks",
          },
        },
      },
    ]),

    PaymentModel.aggregate([
      {
        $match: {
          isVoided: false,
          customerId: {
            $in: customerIds,
          },
        },
      },
      {
        $group: {
          _id: "$customerId",
          paid: {
            $sum: "$appliedAmount",
          },
          unappliedCredit: {
            $sum: "$unappliedAmount",
          },
          received: {
            $sum: "$amount",
          },
        },
      },
    ]),
  ]);

  const salesMap = new Map(
    salesSummary.map((item) => [
      item._id.toString(),
      {
        sales: item.sales || 0,
        packs: item.packs || 0,
      },
    ])
  );

  const paymentsMap = new Map(
    paymentsSummary.map((item) => [
      item._id.toString(),
      {
        paid: item.paid || 0,
        unappliedCredit: item.unappliedCredit || 0,
        received: item.received || 0,
      },
    ])
  );

  const data = customers.map((customer) => {
    const id = customer._id.toString();
    const sales = salesMap.get(id)?.sales || 0;
    const paid = paymentsMap.get(id)?.paid || 0;
    const unappliedCredit = paymentsMap.get(id)?.unappliedCredit || 0;
    const received = paymentsMap.get(id)?.received || 0;
    const packs = salesMap.get(id)?.packs || 0;

    return {
      _id: id,
      customer: customer.name,
      type: customer.type,
      sales,
      paid,
      balance: Math.max(sales - paid, 0),
      unappliedCredit,
      received,
      netPosition: sales - received,
      packs,
    };
  });

  return NextResponse.json({
    success: true,
    data,
  });
}
