// app/api/mobile/products/route.ts
//
// Returns the sellable MENU for the cashier's outlet, grouped by category.
// These are retail items (Fried Chicken C10, Coke Sakto, Rice...), each with
// an optional mapping to raw outlet-inventory stock.

import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { saveUpload } from "@/lib/upload-storage";
import OutletMenuItemModel from "@/models/OutletMenuItem";
import OutletInventoryModel from "@/models/OutletInventory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // needs the Node fs APIs for image saving

type ObjectIdLike = Types.ObjectId;

type OutletInventoryStockRow = {
  productSource?: "BODEGA" | "GROCERY";
  productId?: ObjectIdLike;
  stockQty?: number;
};

type OutletMenuComponentRow = {
  productSource?: "BODEGA" | "GROCERY";
  productId?: ObjectIdLike;
  productName?: string;
  qtyPerSale?: number;
};

type OutletMenuRow = {
  _id: ObjectIdLike;
  name?: string;
  category?: string;
  price?: number;
  imageUrl?: string;
  isAvailable?: boolean;
  components?: OutletMenuComponentRow[];
};

type SerializedMenuItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl: string;
  isAvailable: boolean;
  makeable: number | null;
  components: Array<{
    productSource?: "BODEGA" | "GROCERY";
    productId: string;
    productName: string;
    qtyPerSale: number;
  }>;
};

/**
 * Saves an uploaded menu photo to public/uploads/menu and returns its public
 * URL. Mirrors the payment-receipt upload: type allowlist + 5MB cap, random
 * filename. Returns "" when no file was provided.
 */
async function saveMenuImage(file: File | null): Promise<string> {
  if (!file || file.size === 0) return "";

  const allowed: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = allowed[file.type];
  if (!extension) {
    throw new Error("Menu image must be JPG, PNG, or WEBP.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Menu image must not exceed 5MB.");
  }

  return saveUpload(
    "menu",
    new Uint8Array(await file.arrayBuffer()),
    extension
  );
}

/**
 * Quick-add a simple sellable item from the mobile POS: name + price,
 * category + optional photo. The name must match an active outlet-inventory
 * row and is linked as a one-unit component so every sale deducts stock.
 * Recipe items with multiple ingredients are set up by an administrator.
 *
 * Accepts multipart/form-data (so an image can be attached) and also plain
 * JSON (no image), for backward compatibility.
 */
export async function POST(req: NextRequest) {
  const { user, response } = await requireMobileAuth(req, "sales.manage");
  if (response) return response;

  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  await dbConnect();

  let name = "";
  let category = "Others";
  let price = NaN;
  let imageFile: File | null = null;

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    name = String(form.get("name") || "").trim();
    category = String(form.get("category") || "").trim() || "Others";
    price = Number(form.get("price"));
    const f = form.get("image");
    imageFile = f instanceof File ? f : null;
  } else {
    let body: { name?: string; category?: string; price?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid request body." },
        { status: 400 }
      );
    }
    name = String(body?.name || "").trim();
    category = String(body?.category || "").trim() || "Others";
    price = Number(body?.price);
  }

  if (!name) {
    return NextResponse.json(
      { success: false, message: "Item name is required." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json(
      { success: false, message: "A valid price is required." },
      { status: 400 }
    );
  }

  // Avoid an accidental duplicate of an item that already exists at this outlet.
  const existing = await OutletMenuItemModel.findOne({
    outletId: user.outlet.id,
    name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    isActive: true,
  })
    .select("_id")
    .lean();
  if (existing) {
    return NextResponse.json(
      { success: false, message: `"${name}" is already on the menu.` },
      { status: 409 }
    );
  }

  let imageUrl = "";
  try {
    imageUrl = await saveMenuImage(imageFile);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Could not save the image.";
    return NextResponse.json(
      { success: false, message },
      { status: 400 }
    );
  }

  const item = await OutletMenuItemModel.create({
    outletId: user.outlet.id,
    name,
    category,
    price,
    imageUrl,
    sortOrder: 0,
    isAvailable: true,
    // Quick-added menu items are independent retail products. Inventory
    // mappings are optional and can be configured separately when needed.
    components: [],
    createdBy: user.id,
  });

  return NextResponse.json(
    {
      success: true,
      message: "Item added to menu.",
      item: {
        id: item._id.toString(),
        name: item.name,
        category: item.category,
        price: Number(item.price || 0),
        imageUrl: item.imageUrl || "",
        stockLinked: false,
      },
    },
    { status: 201 }
  );
}

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

  const items = await OutletMenuItemModel.find({
    outletId: user.outlet.id,
    isActive: true,
  })
    .sort({ category: 1, sortOrder: 1, name: 1 })
    .lean<OutletMenuRow[]>();

  // Pull current raw stock for this outlet so we can show availability of
  // mapped components.
  const inventory = await OutletInventoryModel.find({
    outletId: user.outlet.id,
    isActive: true,
  })
    .select("productSource productId stockQty")
    .lean<OutletInventoryStockRow[]>();

  const stockByKey = new Map<string, number>();
  for (const inv of inventory) {
    stockByKey.set(
      `${inv.productSource}:${inv.productId?.toString?.()}`,
      Number(inv.stockQty || 0)
    );
  }

  // How many of each menu item can be made from current stock (min across
  // its components). null = unlimited (no stock mapping).
  function makeableCount(components: OutletMenuComponentRow[] = []): number | null {
    if (!components || components.length === 0) return null;
    let min = Infinity;
    for (const c of components) {
      const per = Number(c.qtyPerSale || 0);
      if (per <= 0) continue;
      const have = stockByKey.get(`${c.productSource}:${c.productId?.toString?.()}`) || 0;
      min = Math.min(min, Math.floor(have / per));
    }
    return min === Infinity ? null : min;
  }

  const serialized: SerializedMenuItem[] = items.map((it) => ({
    id: it._id.toString(),
    name: it.name || "",
    category: it.category || "Others",
    price: Number(it.price || 0),
    imageUrl: it.imageUrl || "",
    isAvailable: it.isAvailable !== false,
    makeable: makeableCount(it.components), // number or null (unlimited)
    components: (it.components || []).map((c) => ({
      productSource: c.productSource,
      productId: c.productId?.toString?.() || "",
      productName: c.productName || "",
      qtyPerSale: Number(c.qtyPerSale || 0),
    })),
  }));

  // Group by category for the UI.
  const byCategory: Record<string, SerializedMenuItem[]> = {};
  for (const item of serialized) {
    (byCategory[item.category] ||= []).push(item);
  }

  const categories = Object.keys(byCategory).map((name) => ({
    name,
    items: byCategory[name],
  }));

  return NextResponse.json({
    success: true,
    outlet: user.outlet,
    categories,
    items: serialized, // flat list too, for convenience
  });
}

