import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requireMobileAuth } from "@/lib/mobile-auth";
import MenuCatalogItemModel from "@/models/MenuCatalogItem";
import OutletMenuItemModel from "@/models/OutletMenuItem";

export const dynamic = "force-dynamic";

type MenuRow = {
  _id: Types.ObjectId;
  catalogItemId?: Types.ObjectId;
  name?: string;
  category?: string;
  price?: number;
  defaultPrice?: number;
  imageUrl?: string;
  components?: unknown[];
  isAvailable?: boolean;
};

const keyOf = (name: string, category: string) =>
  `${category.trim().toLowerCase()}::${name.trim().toLowerCase()}`;

export async function GET(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, [
    "sales.manage",
    "sales.view",
  ]);
  if (response) return response;
  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  await dbConnect();
  const [catalog, assigned, legacy] = await Promise.all([
    MenuCatalogItemModel.find({ isActive: true })
      .sort({ category: 1, name: 1 })
      .lean<MenuRow[]>(),
    OutletMenuItemModel.find({ outletId: user.outlet.id, isActive: true })
      .select("catalogItemId name category price isAvailable")
      .lean<MenuRow[]>(),
    OutletMenuItemModel.find({ isActive: true })
      .sort({ createdAt: 1 })
      .select("name category price imageUrl components")
      .lean<MenuRow[]>(),
  ]);

  const assignedCatalogIds = new Set(
    assigned.map((row) => row.catalogItemId?.toString()).filter(Boolean)
  );
  const assignedKeys = new Set(
    assigned.map((row) => keyOf(row.name || "", row.category || "Others"))
  );
  const catalogKeys = new Set(
    catalog.map((row) => keyOf(row.name || "", row.category || "Others"))
  );

  const items: Array<{
    id: string;
    source: "CATALOG" | "LEGACY";
    name: string;
    category: string;
    defaultPrice: number;
    imageUrl: string;
    assigned: boolean;
  }> = catalog.map((row) => ({
    id: row._id.toString(),
    source: "CATALOG" as const,
    name: row.name || "",
    category: row.category || "Others",
    defaultPrice: Number(row.defaultPrice || 0),
    imageUrl: row.imageUrl || "",
    assigned: assignedCatalogIds.has(row._id.toString()) ||
      assignedKeys.has(keyOf(row.name || "", row.category || "Others")),
  }));

  // Legacy outlet menus remain selectable. The assignment endpoint promotes
  // the selected legacy row into the shared catalog before assigning it.
  const seenLegacy = new Set<string>();
  for (const row of legacy) {
    const key = keyOf(row.name || "", row.category || "Others");
    if (!row.name || catalogKeys.has(key) || seenLegacy.has(key)) continue;
    seenLegacy.add(key);
    items.push({
      id: `legacy:${row._id.toString()}`,
      source: "LEGACY",
      name: row.name,
      category: row.category || "Others",
      defaultPrice: Number(row.price || 0),
      imageUrl: row.imageUrl || "",
      assigned: assignedKeys.has(key),
    });
  }

  items.sort((a, b) =>
    `${a.category}\0${a.name}`.localeCompare(`${b.category}\0${b.name}`)
  );
  return NextResponse.json({ success: true, items });
}
