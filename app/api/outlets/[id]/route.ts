import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { cleanString } from "@/lib/crud-utils";
import OutletModel, { OutletStatus } from "@/models/Outlet";
import OutletInventoryModel from "@/models/OutletInventory";
import AuditLogModel from "@/models/AuditLog";
import CustomerModel from "@/models/Customer";

const outletStatuses: OutletStatus[] = ["ACTIVE", "INACTIVE"];

function isOutletStatus(value: string): value is OutletStatus {
  return outletStatuses.includes(value as OutletStatus);
}

function serializeOutlet(outlet: any) {
  return {
    _id: outlet._id.toString(),
    name: outlet.name || "",
    code: outlet.code || "",
    address: outlet.address || "",
    managerName: outlet.managerName || "",
    contactNumber: outlet.contactNumber || "",
    remarks: outlet.remarks || "",
    status: outlet.status || "ACTIVE",
    createdAt: outlet.createdAt ? new Date(outlet.createdAt).toISOString() : undefined,
    updatedAt: outlet.updatedAt ? new Date(outlet.updatedAt).toISOString() : undefined,
  };
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission("outlets.manage");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid outlet ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const current = await OutletModel.findOne({ _id: id, isActive: true });

  if (!current) {
    return NextResponse.json(
      { success: false, message: "Outlet not found." },
      { status: 404 }
    );
  }

  const body = await req.json();
  const name = cleanString(body.name);
  const code = cleanString(body.code).toUpperCase();
  const address = cleanString(body.address);
  const managerName = cleanString(body.managerName);
  const contactNumber = cleanString(body.contactNumber);
  const remarks = cleanString(body.remarks);
  const statusInput = cleanString(body.status).toUpperCase();

  if (!name) {
    return NextResponse.json(
      { success: false, message: "Outlet name is required." },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { success: false, message: "Outlet code is required." },
      { status: 400 }
    );
  }

  const duplicate = await OutletModel.findOne({
    _id: { $ne: id },
    code,
    isActive: true,
  }).lean();

  if (duplicate) {
    return NextResponse.json(
      { success: false, message: "Outlet code already exists." },
      { status: 409 }
    );
  }

  const oldValue = current.toObject();
  current.name = name;
  current.code = code;
  current.address = address;
  current.managerName = managerName;
  current.contactNumber = contactNumber;
  current.remarks = remarks;
  current.status = isOutletStatus(statusInput) ? statusInput : "ACTIVE";
  await current.save();

  await CustomerModel.findOneAndUpdate(
    { outletId: current._id, isActive: true },
    {
      $set: {
        name,
        address,
        phone: contactNumber,
        type: "SALE",
      },
    }
  );

  await AuditLogModel.create({
    outletId: current._id,
    module: "OUTLETS",
    action: "UPDATE",
    entityType: "OUTLET",
    entityId: current._id,
    oldValue,
    newValue: current.toObject(),
    sourceChannel: "WEB",
    createdBy: session?.user?.id,
  });

  return NextResponse.json({
    success: true,
    message: "Outlet updated successfully.",
    data: serializeOutlet(current.toObject()),
  });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response, session } = await requirePermission("outlets.manage");
  if (response) return response;

  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid outlet ID." },
      { status: 400 }
    );
  }

  await dbConnect();

  const inventoryCount = await OutletInventoryModel.countDocuments({
    outletId: id,
    isActive: true,
    stockQty: { $gt: 0 },
  });

  if (inventoryCount > 0) {
    return NextResponse.json(
      {
        success: false,
        message: "Cannot delete outlet with remaining inventory stock.",
      },
      { status: 409 }
    );
  }

  const outlet = await OutletModel.findOneAndUpdate(
    { _id: id, isActive: true },
    { isActive: false, status: "INACTIVE" },
    { new: true }
  );

  if (!outlet) {
    return NextResponse.json(
      { success: false, message: "Outlet not found." },
      { status: 404 }
    );
  }

  await CustomerModel.updateMany(
    { outletId: outlet._id, isActive: true },
    { $set: { isActive: false } }
  );

  await AuditLogModel.create({
    outletId: outlet._id,
    module: "OUTLETS",
    action: "DELETE",
    entityType: "OUTLET",
    entityId: outlet._id,
    oldValue: outlet.toObject(),
    sourceChannel: "WEB",
    createdBy: session?.user?.id,
  });

  return NextResponse.json({
    success: true,
    message: "Outlet deleted successfully.",
  });
}
