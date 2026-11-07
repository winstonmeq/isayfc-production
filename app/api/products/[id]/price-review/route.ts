import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { validSellingPrice } from "@/lib/product-price-review";
import Product from "@/models/Product";
import History from "@/models/ProductPriceHistory";
import User from "@/models/User";

type Context = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, context: Context) {
  const { response, session } = await requirePermission("products.view");
  if (response) return response;
  const { id } = await context.params;
  if (!isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid product." }, { status: 400 });
  await dbConnect(); void User;
  const product = await Product.findOne({ _id: id, isActive: true }).lean();
  if (!product) return NextResponse.json({ success: false, message: "Product not found." }, { status: 404 });
  const history = await History.find({ productId: id }).sort({ createdAt: -1 }).limit(50).populate("approvedBy", "name").lean();
  return NextResponse.json({ success: true, product, history, canApprove: session?.user.role === "ADMIN" || session?.user.permissions?.includes("products.manage") });
}

export async function POST(req: NextRequest, context: Context) {
  const { response, session: auth } = await requirePermission("products.manage");
  if (response) return response;
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const reason = String(body?.reason || "").trim();
  const expected = String(body?.expectedUpdatedAt || "");
  if (!isValidObjectId(id) || !validSellingPrice(body?.sellingPrice) || reason.length < 3 || reason.length > 500 || !Number.isFinite(Date.parse(expected))) {
    return NextResponse.json({ success: false, message: "Enter a positive selling price (maximum 2 decimals) and a reason." }, { status: 400 });
  }
  await dbConnect();
  const session = await mongoose.startSession();
  try {
    let approved = false;
    await session.withTransaction(async () => {
      approved = false;
      const current = await Product.findOne({ _id: id, isActive: true, updatedAt: new Date(expected) }).session(session);
      if (!current) return;
      const previousPrice = current.unitPrice;
      current.unitPrice = body.sellingPrice;
      current.priceReviewRequired = false;
      current.priceReviewToken = undefined;
      await current.save({ session });
      await History.create([{
        productId: id, previousPrice, sellingPrice: current.unitPrice, buyingCost: current.buyingPrice,
        latestPurchaseCost: current.lastPurchaseCost, reason, approvedBy: auth!.user.id,
      }], { session });
      approved = true;
    });
    if (!approved) return NextResponse.json({ success: false, message: "Product cost or stock changed. Close and reopen Review Price before approving." }, { status: 409 });
    return NextResponse.json({ success: true, message: "Selling price approved. New sales can use this price." });
  } catch {
    return NextResponse.json({ success: false, message: "Price approval failed. No partial price change was saved. Refresh and try again." }, { status: 409 });
  } finally { await session.endSession(); }
}
