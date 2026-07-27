// app/api/customers/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { QueryFilter } from "mongoose";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { CUSTOMER_LOOKUP_PERMISSIONS } from "@/lib/role-permissions";
import {
  cleanString,
  escapeRegex,
  getPagination,
  serializeDocuments,
  serializeDocument,
} from "@/lib/crud-utils";
import CustomerModel, { CustomerType, ICustomer } from "@/models/Customer";
import OutletModel from "@/models/Outlet";

const customerTypes: CustomerType[] = ["SALE", "DELIVERY", "BOTH"];

function isCustomerType(value: string): value is CustomerType {
  return customerTypes.includes(value as CustomerType);
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(CUSTOMER_LOOKUP_PERMISSIONS);

  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);

  const search = cleanString(searchParams.get("search"));
  const type = cleanString(searchParams.get("type")).toUpperCase();

  const filter: QueryFilter<ICustomer> = {
    isActive: true,
  };

  if (search) {
    filter.name = {
      $regex: escapeRegex(search),
      $options: "i",
    };
  }

  if (isCustomerType(type)) {
    filter.type = type;
  }

  const [items, total] = await Promise.all([
    CustomerModel.find(filter)
      .populate("outletId", "name code")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CustomerModel.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map((item: any) => ({
      ...serializeDocuments([item])[0],
      outletId: item.outletId?._id?.toString?.() || "NONE",
      outletName: item.outletId?.name || "",
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

async function handlePOST(req: NextRequest) {
  const { response, session } = await requirePermission("customers.manage");

  if (response) return response;

  await dbConnect();

  const body = await req.json();

  const name = cleanString(body.name);
  const email = cleanString(body.email);
  const phone = cleanString(body.phone);
  const address = cleanString(body.address);
  const typeInput = cleanString(body.type).toUpperCase();
  const outletInput = cleanString(body.outletId);
  const outletId = outletInput === "NONE" ? "" : outletInput;

  if (!name) {
    return NextResponse.json(
      {
        success: false,
        message: "Customer name is required.",
      },
      { status: 400 }
    );
  }
  if (outletId) {
    if (!isValidObjectId(outletId)) {
      return NextResponse.json({ success: false, message: "Invalid outlet." }, { status: 400 });
    }
    const outletExists = await OutletModel.exists({
      _id: outletId,
      isActive: true,
      status: "ACTIVE",
    });
    if (!outletExists) {
      return NextResponse.json({ success: false, message: "Linked outlet was not found or is inactive." }, { status: 400 });
    }
    if (await CustomerModel.exists({ outletId, isActive: true })) {
      return NextResponse.json({ success: false, message: "This outlet is already linked to another customer." }, { status: 409 });
    }
  }

  const customer = await CustomerModel.create({
    name,
    email,
    phone,
    address,
    outletId: outletId || undefined,
    type: isCustomerType(typeInput) ? typeInput : "SALE",
    createdBy: session?.user?.id,
  });

  return NextResponse.json(
    {
      success: true,
      message: "Customer created successfully.",
      data: serializeDocument(customer.toObject()),
    },
    { status: 201 }
  );
}

export const POST = withAuditLog(handlePOST, {
  module: "CUSTOMERS",
  action: "CREATE",
  entityType: "CUSTOMER",
});
