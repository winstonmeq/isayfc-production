import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import MenuCatalogItemModel from "@/models/MenuCatalogItem";
import OutletModel from "@/models/Outlet";
import OutletMenuItemModel from "@/models/OutletMenuItem";
import UserModel from "@/models/User";

export const dynamic = "force-dynamic";

async function canManageOutlet(userId: string, outletId: string) {
  if (!isValidObjectId(outletId)) return false;
  const user = await UserModel.findById(userId).select("role outletId").lean<{
    role?: string;
    outletId?: { toString(): string };
  }>();
  if (!user) return false;
  const isAdmin = String(user.role || "").toUpperCase() === "ADMIN";
  if (!isAdmin && user.outletId?.toString() !== outletId) return false;
  return Boolean(await OutletModel.exists({ _id: outletId, isActive: true, status: "ACTIVE" }));
}

export async function GET(req: NextRequest) {
  const { session, response } = await requirePermission(["pos.view", "pos.manage"]);
  if (response) return response;
  await dbConnect();

  const outletId = new URL(req.url).searchParams.get("outletId") || "";
  if (!(await canManageOutlet(session!.user.id, outletId))) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }

  const [catalog, assigned] = await Promise.all([
    MenuCatalogItemModel.find({ isActive: true }).sort({ category: 1, name: 1 }).lean<any[]>(),
    OutletMenuItemModel.find({ outletId, isActive: true }).sort({ category: 1, name: 1 }).lean<any[]>(),
  ]);
  const assignedCatalogIds = new Set(assigned.map((row) => row.catalogItemId?.toString()).filter(Boolean));

  return NextResponse.json({
    success: true,
    catalog: catalog.map((row) => ({
      id: row._id.toString(),
      name: row.name,
      category: row.category || "Others",
      defaultPrice: Number(row.defaultPrice || 0),
      assigned: assignedCatalogIds.has(row._id.toString()),
    })),
    assigned: assigned.map((row) => ({
      id: row._id.toString(),
      catalogItemId: row.catalogItemId?.toString() || "",
      name: row.name,
      category: row.category || "Others",
      price: Number(row.price || 0),
      isAvailable: row.isAvailable !== false,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requirePermission("pos.manage");
  if (response) return response;
  await dbConnect();

  const body = await req.json().catch(() => null) as null | {
    action?: "CREATE" | "ASSIGN" | "UPDATE" | "REMOVE";
    outletId?: string;
    catalogItemId?: string;
    menuItemId?: string;
    name?: string;
    category?: string;
    price?: number;
    isAvailable?: boolean;
  };
  const outletId = String(body?.outletId || "");
  if (!(await canManageOutlet(session!.user.id, outletId))) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }

  if (body?.action === "CREATE") {
    const name = String(body.name || "").trim();
    const category = String(body.category || "").trim() || "Others";
    const price = Number(body.price);
    if (!name || !Number.isFinite(price) || price < 0) {
      return NextResponse.json({ success: false, message: "Enter a product name and valid selling price." }, { status: 400 });
    }

    const normalizedName = name.toLowerCase();
    let catalog = await MenuCatalogItemModel.findOne({ normalizedName, category, isActive: true });
    if (!catalog) {
      catalog = await MenuCatalogItemModel.create({
        name, normalizedName, category, defaultPrice: price, components: [],
        isActive: true, createdBy: session!.user.id,
      });
    }

    const existing = await OutletMenuItemModel.findOne({ outletId, catalogItemId: catalog._id });
    if (existing?.isActive) {
      return NextResponse.json({ success: false, message: `${catalog.name} is already on this outlet menu.` }, { status: 409 });
    }
    if (existing) {
      existing.name = catalog.name; existing.category = catalog.category;
      existing.price = price; existing.isAvailable = true; existing.isActive = true;
      await existing.save();
    } else {
      await OutletMenuItemModel.create({
        outletId, catalogItemId: catalog._id, name: catalog.name,
        category: catalog.category, price, imageUrl: catalog.imageUrl || "",
        components: catalog.components || [], isAvailable: true, isActive: true,
        createdBy: session!.user.id,
      });
    }
    return NextResponse.json({ success: true, message: `${catalog.name} created and added to this outlet.` }, { status: 201 });
  }

  if (body?.action === "ASSIGN") {
    const catalogItemId = String(body.catalogItemId || "");
    const price = Number(body.price);
    if (!isValidObjectId(catalogItemId) || !Number.isFinite(price) || price < 0) {
      return NextResponse.json({ success: false, message: "Select a product and enter a valid price." }, { status: 400 });
    }
    const catalog = await MenuCatalogItemModel.findOne({ _id: catalogItemId, isActive: true });
    if (!catalog) return NextResponse.json({ success: false, message: "Menu product not found." }, { status: 404 });

    const existing = await OutletMenuItemModel.findOne({ outletId, catalogItemId: catalog._id });
    if (existing) {
      existing.isActive = true;
      existing.isAvailable = true;
      existing.price = price;
      await existing.save();
      return NextResponse.json({ success: true, message: `${catalog.name} added to this outlet.` });
    }
    await OutletMenuItemModel.create({
      outletId,
      catalogItemId: catalog._id,
      name: catalog.name,
      category: catalog.category,
      price,
      imageUrl: catalog.imageUrl || "",
      components: catalog.components || [],
      isAvailable: true,
      isActive: true,
      createdBy: session!.user.id,
    });
    return NextResponse.json({ success: true, message: `${catalog.name} added to this outlet.` }, { status: 201 });
  }

  const menuItemId = String(body?.menuItemId || "");
  if (!isValidObjectId(menuItemId)) {
    return NextResponse.json({ success: false, message: "Select a valid menu item." }, { status: 400 });
  }
  const item = await OutletMenuItemModel.findOne({ _id: menuItemId, outletId, isActive: true });
  if (!item) return NextResponse.json({ success: false, message: "Outlet menu item not found." }, { status: 404 });

  if (body?.action === "REMOVE") {
    item.isActive = false;
    await item.save();
    return NextResponse.json({ success: true, message: `${item.name} removed from this outlet.` });
  }
  if (body?.action === "UPDATE") {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ success: false, message: "Enter a valid selling price." }, { status: 400 });
    }
    item.price = price;
    item.isAvailable = body.isAvailable !== false;
    await item.save();
    return NextResponse.json({ success: true, message: `${item.name} updated.` });
  }

  return NextResponse.json({ success: false, message: "Invalid menu action." }, { status: 400 });
}
