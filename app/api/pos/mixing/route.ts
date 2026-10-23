import { NextRequest, NextResponse } from "next/server";
import mongoose, { ClientSession, Types, isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { packingSnapshot, toBaseUnitCost } from "@/lib/inventory-units";
import { calculateProductionBatchCost } from "@/lib/production-costing";
import { requirePermission } from "@/lib/require-permission";
import OutletModel from "@/models/Outlet";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletMenuItemModel from "@/models/OutletMenuItem";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import UserModel from "@/models/User";

export const dynamic = "force-dynamic";

async function authorizedOutlet(userId: string, outletId: string) {
  if (!isValidObjectId(outletId)) return null;
  const user = await UserModel.findById(userId).select("role outletId").lean<any>();
  const admin = String(user?.role || "").toUpperCase() === "ADMIN";
  if (!admin && String(user?.outletId || "") !== outletId) return null;
  return OutletModel.findOne({ _id: outletId, isActive: true, status: "ACTIVE" }).lean();
}

function baseCost(row: any) {
  const baseUnit = row.productSource === "GROCERY" ? "QTY" : row.unitLabel === "HEAD" ? "HEAD" : "PCS";
  return toBaseUnitCost(row.buyingPrice, packingSnapshot({
    unit: Number(row.packSize || 0) > 0 ? "PACK" : baseUnit,
    baseUnit,
    multiplier: Number(row.packSize || 0) || 1,
  }));
}

export async function POST(req: NextRequest) {
  const { session, response } = await requirePermission("pos.manage");
  if (response) return response;
  await dbConnect();
  const body = await req.json().catch(() => null) as any;
  const outletId = String(body?.outletId || "");
  if (!(await authorizedOutlet(session!.user.id, outletId))) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }
  const menuId = String(body?.menuItemId || "");
  const outputQty = Math.trunc(Number(body?.outputQty || 0));
  const requestedSources = Array.isArray(body?.sources) && body.sources.length > 0
    ? body.sources
    : [{ inventoryId: body?.sourceInventoryId, quantity: body?.sourceQty }];
  const quantitiesByInventory = new Map<string, number>();
  for (const requested of requestedSources) {
    const inventoryId = String(requested?.inventoryId || "");
    const quantity = Math.trunc(Number(requested?.quantity ?? requested?.qty ?? 0));
    if (!isValidObjectId(inventoryId) || quantity < 1) {
      return NextResponse.json({ success: false, message: "Every ingredient must have a valid whole quantity." }, { status: 400 });
    }
    quantitiesByInventory.set(inventoryId, (quantitiesByInventory.get(inventoryId) || 0) + quantity);
  }
  const ingredients = [...quantitiesByInventory].map(([inventoryId, quantity]) => ({ inventoryId, quantity }));
  if (!isValidObjectId(menuId) || ingredients.length < 1 || outputQty < 1) {
    return NextResponse.json({ success: false, message: "Select at least one ingredient and an output product, then enter valid whole quantities." }, { status: 400 });
  }

  async function performMixing(mongoSession?: ClientSession) {
      const sessionOptions = mongoSession ? { session: mongoSession } : {};
      const [sources, menu] = await Promise.all([
        OutletInventoryModel.find({ _id: { $in: ingredients.map((item) => item.inventoryId) }, outletId, isActive: true }).session(mongoSession || null),
        OutletMenuItemModel.findOne({ _id: menuId, outletId, isActive: true }).session(mongoSession || null),
      ]);
      if (!menu || sources.length !== ingredients.length) throw new Error("One or more selected mixing products are unavailable.");

      const sourceById = new Map(sources.map((source) => [String(source._id), source]));
      for (const ingredient of ingredients) {
        const source = sourceById.get(ingredient.inventoryId);
        if (!source) throw new Error("One or more selected mixing products are unavailable.");
        if (Number(source.stockQty || 0) < ingredient.quantity) {
          throw new Error(`${source.productName} has only ${source.stockQty} available.`);
        }
      }

      const referenceId = new Types.ObjectId();
      const costing = calculateProductionBatchCost({
        ingredients: ingredients.map((ingredient) => ({
          inventoryId: ingredient.inventoryId,
          quantity: ingredient.quantity,
          unitCost: baseCost(sourceById.get(ingredient.inventoryId)),
        })),
        outputQty,
      });

      let target = await OutletInventoryModel.findOne({ outletId, productId: menu._id, isActive: true }).session(mongoSession || null);
      if (!target) target = await OutletInventoryModel.findOne({ outletId, productName: menu.name, isActive: true }).session(mongoSession || null);
      if (target && quantitiesByInventory.has(String(target._id))) {
        throw new Error("The output product cannot also be used as an ingredient in the same batch.");
      }
      if (!target) {
        const created = await OutletInventoryModel.create([{
          outletId, productSource: sources[0].productSource, originType: "OUTLET_PRODUCTION", productId: menu._id,
          productName: menu.name, categoryName: menu.category || "",
          stockQty: 0, unitLabel: "QTY", packSize: 0,
          buyingPrice: costing.producedUnitCost, sellingPrice: Number(menu.price || 0),
          remarks: "WEB POS MIXING OUTPUT", isActive: true, createdBy: session!.user.id,
        }], sessionOptions);
        target = created[0];
      }
      const targetBefore = Number(target.stockQty || 0);
      target.originType = "OUTLET_PRODUCTION";
      const existingUnitCost = baseCost(target);
      const weighted = calculateProductionBatchCost({
        ingredients: ingredients.map((ingredient) => ({
          inventoryId: ingredient.inventoryId,
          quantity: ingredient.quantity,
          unitCost: baseCost(sourceById.get(ingredient.inventoryId)),
        })),
        outputQty,
        existingOutputQty: targetBefore,
        existingOutputUnitCost: existingUnitCost,
      });
      target.stockQty = targetBefore + outputQty;
      target.buyingPrice = weighted.weightedUnitCost;
      await target.save(sessionOptions);

      const now = new Date();
      const movements = [];
      for (const ingredient of ingredients) {
        const source = sourceById.get(ingredient.inventoryId)!;
        const sourceBefore = Number(source.stockQty || 0);
        source.stockQty = sourceBefore - ingredient.quantity;
        await source.save(sessionOptions);
        movements.push({ outletId, outletInventoryId: source._id, productSource: source.productSource, productId: source.productId, productName: source.productName, transactionDate: now, type: "REPACK_OUT", quantity: ingredient.quantity, unitCost: baseCost(source), entryUnit: source.unitLabel, entryQty: ingredient.quantity, multiplier: 1, baseUnit: source.productSource === "GROCERY" ? "QTY" : source.unitLabel === "HEAD" ? "HEAD" : "PCS", previousStock: sourceBefore, newStock: source.stockQty, referenceType: "REPACK", referenceId, sourceChannel: "WEB", remarks: String(body?.remarks || "POS PRODUCT MIXING"), createdBy: session!.user.id });
      }
      movements.push({ outletId, outletInventoryId: target._id, productSource: target.productSource, productId: target.productId, productName: target.productName, transactionDate: now, type: "REPACK_IN", quantity: outputQty, unitCost: costing.producedUnitCost, entryUnit: "QTY", entryQty: outputQty, multiplier: 1, baseUnit: "QTY", previousStock: targetBefore, newStock: target.stockQty, referenceType: "REPACK", referenceId, sourceChannel: "WEB", remarks: String(body?.remarks || "POS PRODUCT MIXING"), createdBy: session!.user.id });
      await OutletStockTransactionModel.insertMany(movements, sessionOptions);

      return costing;
  }

  const mongoSession = await mongoose.startSession();
  try {
    await mongoSession.withTransaction(() => performMixing(mongoSession));
    return NextResponse.json({ success: true, message: "Production batch saved with complete ingredient cost allocation." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save product mixing.";
    const transactionUnavailable = /transaction numbers are only allowed|replica set|sharded cluster|shared cluster/i.test(message);
    return NextResponse.json({
      success: false,
      message: transactionUnavailable
        ? "Product mixing requires MongoDB transaction support. Use MongoDB Atlas or a replica set; no stock was changed."
        : message,
    }, { status: transactionUnavailable ? 503 : 409 });
  } finally {
    await mongoSession.endSession();
  }
}
