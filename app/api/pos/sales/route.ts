import { createHash, randomUUID } from "crypto";
import { menuStock } from "@/lib/business-flow";
import { NextRequest, NextResponse } from "next/server";
import mongoose, { isValidObjectId } from "mongoose";

import { manilaDateString } from "@/lib/date-utils";
import { packingSnapshot, toBaseUnitCost } from "@/lib/inventory-units";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import OutletModel from "@/models/Outlet";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletMenuItemModel from "@/models/OutletMenuItem";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";
import UserModel from "@/models/User";

export const dynamic = "force-dynamic";

class PosError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type CartLine = { menuItemId?: string; qty?: number };

export async function POST(req: NextRequest) {
  const { session, response } = await requirePermission("pos.manage");
  if (response) return response;
  await dbConnect();

  const body = await req.json().catch(() => null) as null | {
    outletId?: string;
    items?: CartLine[];
    cashReceived?: number;
    remarks?: string;
    isLateEntry?: boolean;
    originalSaleAt?: string;
    lateEntryReason?: string;
    paymentMethod?: string;
    employeeId?: string;
    idempotencyKey?: string;
  };
  const outletId = String(body?.outletId || "");
  const user = await UserModel.findById(session!.user.id).select("role outletId").lean<any>();
  const assigned = user?.outletId?.toString() || "";
  const isAdmin = session!.user.role === "ADMIN";
  const outlet = isValidObjectId(outletId) && (isAdmin || assigned === outletId)
    ? await OutletModel.findOne({ _id: outletId, isActive: true, status: "ACTIVE" }).lean()
    : null;
  if (!outlet) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }

  const cart = Array.isArray(body?.items) ? body.items : [];
  if (!cart.length) {
    return NextResponse.json({ success: false, message: "Cart is empty." }, { status: 400 });
  }
  const paymentMethod = "CASH";
  const idempotencyKey = String(body?.idempotencyKey || "");
  const entryHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");

  const mongoSession = await mongoose.startSession();
  try {
    let result: Record<string, unknown> | null = null;
    await mongoSession.withTransaction(async () => {
      if (idempotencyKey) {
        const previous = await SaleModel.findOne({ outletId, idempotencyKey }).session(mongoSession);
        if (previous) {
          if (previous.entryHash !== entryHash) throw new PosError(409, "This transaction key was already used. Reload sales before entering a different sale.");
          result = { id: String(previous._id), receiptNumber: previous.receiptNumber, totalAmount: previous.totalAmount, totalQty: previous.totalQty, change: previous.change || 0, saleDate: previous.saleDate.toISOString(), paymentMethod: "CASH" };
          return;
        }
      }
      const encodedAt = new Date();
      const isLateEntry = body?.isLateEntry === true;
      let saleAt = encodedAt;
      let lateEntryReason = "";
      if (isLateEntry) {
        saleAt = new Date(String(body?.originalSaleAt || ""));
        lateEntryReason = String(body?.lateEntryReason || "").replace(/\s+/g, " ").trim();
        if (Number.isNaN(saleAt.getTime())) throw new PosError(400, "Enter the original sale date and time.");
        if (saleAt.getTime() > encodedAt.getTime() + 60_000) throw new PosError(400, "The original sale time cannot be in the future.");
        if (lateEntryReason.length < 3) throw new PosError(400, "Enter a reason for the late sale.");
        lateEntryReason = lateEntryReason.slice(0, 250);
      }

      const ids = cart.map((row) => String(row.menuItemId || "")).filter(isValidObjectId);
      const menuItems = await OutletMenuItemModel.find({
        _id: { $in: ids },
        outletId,
        isActive: true,
        isAvailable: true,
      }).session(mongoSession);
      const menuById = new Map(menuItems.map((row) => [row._id.toString(), row]));
      const inventory = await OutletInventoryModel.find({
        outletId,
        isActive: true,
        productId: { $in: menuItems.map((row) => row._id) },
      }).session(mongoSession);

      const lines: any[] = [];
      const deductions = new Map<string, { inventory: any; qty: number }>();
      let totalAmount = 0;
      let totalQty = 0;
      for (const cartLine of cart) {
        const menu = menuById.get(String(cartLine.menuItemId));
        if (!menu) throw new PosError(404, "A menu item is unavailable.");
        const qty = Number(cartLine.qty || 0);
        if (!Number.isSafeInteger(qty) || qty < 1) throw new PosError(400, `Invalid quantity for ${menu.name}.`);
        const finished = menuStock(inventory, menu._id);
        if (!finished) throw new PosError(409, `${menu.name} has no finished outlet stock.`);
        const current = Number(finished.stockQty || 0);
        const accumulated = deductions.get(finished._id.toString())?.qty || 0;
        if (current < accumulated + qty) {
          throw new PosError(409, `${menu.name} has only ${current} available.`);
        }
        deductions.set(finished._id.toString(), { inventory: finished, qty: accumulated + qty });
        const price = Number(menu.price || 0);
        const lineTotal = price * qty;
        const baseUnit = finished.productSource === "GROCERY" ? "QTY" : "PCS";
        const unitCost = toBaseUnitCost(
          finished.buyingPrice,
          packingSnapshot({
            unit: Number(finished.packSize || 0) > 0 ? "PACK" : "QTY",
            baseUnit,
            multiplier: finished.packSize,
          })
        );
        totalAmount += lineTotal;
        totalQty += qty;
        lines.push({
          source: "OUTLET",
          outletInventoryId: finished._id,
          companyUnitCost: finished.companyUnitCost,
          menuItemId: menu._id,
          productName: menu.name,
          categoryName: menu.category,
          qty,
          price,
          lineTotal,
          unitCost,
          stockUnit: "QTY",
          packSize: 1,
          stockPcsOut: qty,
          baseUnit: "QTY",
          baseQty: qty,
          entryUnit: "QTY",
          multiplier: 1,
          remarks: `MENU:${menu._id.toString()}`,
        });
      }

      totalAmount = Math.round(totalAmount * 100) / 100;
      const cashReceived = Number(body?.cashReceived);
      if (!Number.isFinite(cashReceived) || cashReceived < totalAmount) {
        throw new PosError(400, `Cash received must be at least ${totalAmount.toFixed(2)}.`);
      }
      const receiptNumber = `POS-${manilaDateString(saleAt).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const auditRemark = isLateEntry
        ? ` LATE_ENTRY SOLD_AT:${saleAt.toISOString()} ENCODED_AT:${encodedAt.toISOString()} REASON:${lateEntryReason}`
        : "";
      const [sale] = await (SaleModel as any).create([{
        receiptNumber,
        saleDate: saleAt,
        source: "OUTLET",
        outletId,
        channel: "WEB",
        paymentMethod: "CASH",
        ...(idempotencyKey ? { idempotencyKey, entryHash } : {}),
        cashReceived,
        change: cashReceived - totalAmount,
        totalAmount,
        paidAmount: totalAmount,
        balance: 0,
        totalQty,
        status: "PAID",
        remarks: `WEB POS OUTLET:${outletId} ${String(body?.remarks || "").trim()}${auditRemark}`,
        createdBy: session!.user.id,
      }], { session: mongoSession });
      await (SaleLineModel as any).insertMany(lines.map((line) => ({ ...line, saleId: sale._id })), { session: mongoSession });

      for (const { inventory: stock, qty } of deductions.values()) {
        const before = Number(stock.stockQty || 0);
        const after = before - qty;
        stock.stockQty = after;
        await stock.save({ session: mongoSession });
        const baseUnit = stock.productSource === "GROCERY" ? "QTY" : "PCS";
        const unitCost = toBaseUnitCost(
          stock.buyingPrice,
          packingSnapshot({ unit: Number(stock.packSize || 0) > 0 ? "PACK" : "QTY", baseUnit, multiplier: stock.packSize })
        );
        await (OutletStockTransactionModel as any).create([{
          outletId,
          outletInventoryId: stock._id,
          productSource: stock.productSource,
          productId: stock.productId,
          productName: stock.productName,
          transactionDate: saleAt,
          type: "SALE",
          quantity: qty,
          unitCost,
          entryUnit: baseUnit,
          entryQty: qty,
          multiplier: 1,
          baseUnit,
          previousStock: before,
          newStock: after,
          referenceType: "WEB_POS_SALE",
          referenceId: sale._id,
          sourceChannel: "WEB",
          remarks: `SALE ${receiptNumber}${auditRemark}`,
          createdBy: session!.user.id,
        }], { session: mongoSession });
      }
      result = { id: sale._id.toString(), receiptNumber, totalAmount, totalQty, change: cashReceived - totalAmount, saleDate: saleAt.toISOString(), encodedAt: encodedAt.toISOString(), isLateEntry, paymentMethod: "CASH" };
    });
    return NextResponse.json({ success: true, message: "Sale recorded.", sale: result });
  } catch (error) {
    if (error instanceof PosError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ success: false, message: "Unable to record the sale." }, { status: 500 });
  } finally {
    await mongoSession.endSession();
  }
}
