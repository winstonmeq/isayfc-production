// app/api/customers/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { withAuditLog } from "@/lib/audit-log";
import { cleanString, serializeDocument } from "@/lib/crud-utils";
import CustomerModel, { CustomerType } from "@/models/Customer";
import OutletModel from "@/models/Outlet";

const customerTypes: CustomerType[] = ["SALE", "DELIVERY", "BOTH"];

function isCustomerType(value: string): value is CustomerType {
  return customerTypes.includes(value as CustomerType);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission(["customers.view", "customers.manage"]);

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid customer ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const customer = await CustomerModel.findOne({
    _id: id,
    isActive: true,
  }).lean();

  if (!customer) {
    return NextResponse.json(
      {
        success: false,
        message: "Customer not found.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: serializeDocument(customer),
  });
}

async function handlePATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("customers.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid customer ID.",
      },
      { status: 400 }
    );
  }

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
    if (await CustomerModel.exists({ _id: { $ne: id }, outletId, isActive: true })) {
      return NextResponse.json({ success: false, message: "This outlet is already linked to another customer." }, { status: 409 });
    }
  }

  const updatedCustomer = await CustomerModel.findOneAndUpdate(
    {
      _id: id,
      isActive: true,
    },
    {
      $set: {
        name,
        email,
        phone,
        address,
        type: isCustomerType(typeInput) ? typeInput : "SALE",
        ...(outletId ? { outletId } : {}),
      },
      ...(!outletId ? { $unset: { outletId: 1 } } : {}),
    },
    {
      new: true,
    }
  ).lean();

  if (!updatedCustomer) {
    return NextResponse.json(
      {
        success: false,
        message: "Customer not found.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Customer updated successfully.",
    data: serializeDocument(updatedCustomer),
  });
}

async function handleDELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requirePermission("customers.manage");

  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid customer ID.",
      },
      { status: 400 }
    );
  }

  await dbConnect();

  const deletedCustomer = await CustomerModel.findOneAndUpdate(
    {
      _id: id,
      isActive: true,
    },
    {
      isActive: false,
    },
    {
      new: true,
    }
  ).lean();

  if (!deletedCustomer) {
    return NextResponse.json(
      {
        success: false,
        message: "Customer not found.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Customer deleted successfully.",
  });
}

export const PATCH = withAuditLog(handlePATCH, {
  module: "CUSTOMERS",
  action: "UPDATE",
  entityType: "CUSTOMER",
});

export const DELETE = withAuditLog(handleDELETE, {
  module: "CUSTOMERS",
  action: "DELETE",
  entityType: "CUSTOMER",
});
