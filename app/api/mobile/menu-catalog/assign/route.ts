import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requireMobileAuth } from "@/lib/mobile-auth";
import MenuCatalogItemModel from "@/models/MenuCatalogItem";
import OutletMenuItemModel from "@/models/OutletMenuItem";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, "pos.menu.manage");
  if (response) return response;
  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  let rawId = "";
  let priceOverride: number | undefined;
  try {
    const body = await req.json();
    rawId = String(body?.catalogItemId || "");
    if (body?.price != null) priceOverride = Number(body.price);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }
  const isLegacy = rawId.startsWith("legacy:");
  const id = isLegacy ? rawId.slice(7) : rawId;
  if (!isValidObjectId(id) || (priceOverride != null && (!Number.isFinite(priceOverride) || priceOverride < 0))) {
    return NextResponse.json({ success: false, message: "Select a valid catalog item." }, { status: 400 });
  }

  await dbConnect();
  let catalog = isLegacy ? null : await MenuCatalogItemModel.findOne({ _id: id, isActive: true });
  if (isLegacy) {
    const legacy = await OutletMenuItemModel.findOne({ _id: id, isActive: true }).lean();
    if (!legacy) {
      return NextResponse.json({ success: false, message: "Menu item not found." }, { status: 404 });
    }
    const normalizedName = legacy.name.trim().toLowerCase();
    catalog = await MenuCatalogItemModel.findOneAndUpdate(
      { normalizedName, category: legacy.category, isActive: true },
      {
        $setOnInsert: {
          name: legacy.name,
          normalizedName,
          category: legacy.category,
          defaultPrice: legacy.price,
          imageUrl: legacy.imageUrl || "",
          components: legacy.components || [],
          isActive: true,
          createdBy: user.id,
        },
      },
      { new: true, upsert: true, runValidators: true }
    );
    if (!catalog) {
      return NextResponse.json(
        { success: false, message: "Could not create the shared catalog item." },
        { status: 500 }
      );
    }
    await OutletMenuItemModel.updateMany(
      {
        isActive: true,
        catalogItemId: { $exists: false },
        category: legacy.category,
        name: {
          $regex: `^${legacy.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          $options: "i",
        },
      },
      { $set: { catalogItemId: catalog._id } }
    );
  }
  if (!catalog) {
    return NextResponse.json({ success: false, message: "Catalog item not found." }, { status: 404 });
  }

  const duplicate = await OutletMenuItemModel.findOne({
    outletId: user.outlet.id,
    isActive: true,
    $or: [
      { catalogItemId: catalog._id },
      { name: { $regex: `^${catalog.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
    ],
  });
  if (duplicate) {
    if (!duplicate.catalogItemId) {
      duplicate.catalogItemId = catalog._id;
      await duplicate.save();
    }
    return NextResponse.json({ success: true, message: "Item is already assigned.", itemId: duplicate._id.toString() });
  }

  const item = await OutletMenuItemModel.create({
    outletId: user.outlet.id,
    catalogItemId: catalog._id,
    name: catalog.name,
    category: catalog.category,
    price: priceOverride ?? catalog.defaultPrice,
    imageUrl: catalog.imageUrl || "",
    components: catalog.components || [],
    sortOrder: 0,
    isAvailable: true,
    isActive: true,
    createdBy: user.id,
  });
  return NextResponse.json(
    { success: true, message: "Item added to this outlet menu.", itemId: item._id.toString() },
    { status: 201 }
  );
}
