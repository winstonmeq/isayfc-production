import { NextRequest, NextResponse } from "next/server";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import {
  cleanString,
  escapeRegex,
  getPagination,
} from "@/lib/crud-utils";
import OutletModel, { OutletStatus } from "@/models/Outlet";
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

export async function GET(req: NextRequest) {
  const { response } = await requirePermission(req.nextUrl.searchParams.get("lookup") === "true" ? ["outlets.view", "users.manage"] : "outlets.view");
  if (response) return response;

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = getPagination(searchParams);
  const search = cleanString(searchParams.get("search"));
  const status = cleanString(searchParams.get("status")).toUpperCase();

  const filter: Record<string, any> = {
    isActive: true,
  };

  if (search) {
    filter.$or = [
      { name: { $regex: escapeRegex(search), $options: "i" } },
      { code: { $regex: escapeRegex(search), $options: "i" } },
      { managerName: { $regex: escapeRegex(search), $options: "i" } },
      { address: { $regex: escapeRegex(search), $options: "i" } },
    ];
  }

  if (isOutletStatus(status)) {
    filter.status = status;
  }

  const [items, total, activeCount, inactiveCount] = await Promise.all([
    OutletModel.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    OutletModel.countDocuments(filter),
    OutletModel.countDocuments({ isActive: true, status: "ACTIVE" }),
    OutletModel.countDocuments({ isActive: true, status: "INACTIVE" }),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map(serializeOutlet),
    summary: {
      activeCount,
      inactiveCount,
      totalCount: activeCount + inactiveCount,
    },
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
}

export async function POST(req: NextRequest) {
  const { response, session } = await requirePermission("outlets.manage");
  if (response) return response;

  await dbConnect();

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

  const existing = await OutletModel.findOne({
    code,
    isActive: true,
  }).lean();

  if (existing) {
    return NextResponse.json(
      { success: false, message: "Outlet code already exists." },
      { status: 409 }
    );
  }

  const outlet = await OutletModel.create({
    name,
    code,
    address,
    managerName,
    contactNumber,
    remarks,
    status: isOutletStatus(statusInput) ? statusInput : "ACTIVE",
    createdBy: session?.user?.id,
  });

  const existingCustomer = await CustomerModel.findOne({
    name,
    isActive: true,
    $or: [{ outletId: { $exists: false } }, { outletId: null }],
  });
  if (existingCustomer) {
    existingCustomer.outletId = outlet._id;
    existingCustomer.address = address;
    existingCustomer.phone = contactNumber;
    existingCustomer.type = "SALE";
    await existingCustomer.save();
  } else {
    await CustomerModel.create({
      name,
      address,
      phone: contactNumber,
      type: "SALE",
      outletId: outlet._id,
      createdBy: session?.user?.id,
    });
  }

  await AuditLogModel.create({
    outletId: outlet._id,
    module: "OUTLETS",
    action: "CREATE",
    entityType: "OUTLET",
    entityId: outlet._id,
    newValue: outlet.toObject(),
    sourceChannel: "WEB",
    createdBy: session?.user?.id,
  });

  return NextResponse.json(
    {
      success: true,
      message: "Outlet created successfully.",
      data: serializeOutlet(outlet.toObject()),
    },
    { status: 201 }
  );
}
