import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { saveUpload } from "@/lib/upload-storage";
import MenuCatalogItemModel from "@/models/MenuCatalogItem";
import OutletMenuItemModel from "@/models/OutletMenuItem";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function saveMenuImage(file: File | null) {
  if (!file || file.size === 0) return "";
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensions[file.type];
  if (!extension) throw new Error("Menu image must be JPG, PNG, or WEBP.");
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Menu image must not exceed 5MB.");
  }
  return saveUpload(
    "menu",
    new Uint8Array(await file.arrayBuffer()),
    extension
  );
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireMobileAuth(req, "sales.manage");
  if (response) return response;
  if (!user.outlet) {
    return NextResponse.json(
      { success: false, message: "Your account is not assigned to an outlet." },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid menu item." },
      { status: 400 }
    );
  }

  let name = "";
  let category = "Others";
  let price = NaN;
  let isAvailable = true;
  let removeImage = false;
  let imageFile: File | null = null;
  const contentType = req.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      name = String(form.get("name") || "").trim();
      category = String(form.get("category") || "").trim() || "Others";
      price = Number(form.get("price"));
      isAvailable = String(form.get("isAvailable")) !== "false";
      removeImage = String(form.get("removeImage")) === "true";
      const file = form.get("image");
      imageFile = file instanceof File ? file : null;
    } else {
      const body = await req.json();
      name = String(body?.name || "").trim();
      category = String(body?.category || "").trim() || "Others";
      price = Number(body?.price);
      isAvailable = body?.isAvailable !== false;
      removeImage = body?.removeImage === true;
    }
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!name || !Number.isFinite(price) || price < 0) {
    return NextResponse.json(
      { success: false, message: "Enter an item name and a valid price." },
      { status: 400 }
    );
  }

  await dbConnect();
  const duplicate = await OutletMenuItemModel.exists({
    _id: { $ne: id },
    outletId: user.outlet.id,
    isActive: true,
    name: {
      $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      $options: "i",
    },
  });
  if (duplicate) {
    return NextResponse.json(
      { success: false, message: `"${name}" is already on the menu.` },
      { status: 409 }
    );
  }

  let imageUrl: string | undefined;
  try {
    if (imageFile) imageUrl = await saveMenuImage(imageFile);
    else if (removeImage) imageUrl = "";
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Could not save the image.",
      },
      { status: 400 }
    );
  }

  const item = await OutletMenuItemModel.findOneAndUpdate(
    { _id: id, outletId: user.outlet.id, isActive: true },
    {
      $set: {
        name,
        category,
        price,
        isAvailable,
        ...(imageUrl !== undefined ? { imageUrl } : {}),
      },
    },
    { new: true, runValidators: true }
  );
  if (!item) {
    return NextResponse.json(
      { success: false, message: "Menu item not found." },
      { status: 404 }
    );
  }

  // Shared fields are maintained in the catalog and copied to every linked
  // outlet assignment. Availability remains outlet-specific.
  if (item.catalogItemId) {
    await Promise.all([
      MenuCatalogItemModel.updateOne(
        { _id: item.catalogItemId, isActive: true },
        {
          $set: {
            name,
            normalizedName: name.toLowerCase(),
            category,
            defaultPrice: price,
            ...(imageUrl !== undefined ? { imageUrl } : {}),
          },
        },
        { runValidators: true }
      ),
      OutletMenuItemModel.updateMany(
        { catalogItemId: item.catalogItemId, isActive: true },
        {
          $set: {
            name,
            category,
            price,
            ...(imageUrl !== undefined ? { imageUrl } : {}),
          },
        }
      ),
    ]);
  }

  return NextResponse.json({
    success: true,
    message: "Menu item updated.",
    item: {
      id: item._id.toString(),
      name: item.name,
      category: item.category,
      price: Number(item.price || 0),
      imageUrl: item.imageUrl || "",
      isAvailable: item.isAvailable,
    },
  });
}
