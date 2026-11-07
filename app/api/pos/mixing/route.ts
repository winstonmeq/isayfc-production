import { NextRequest, NextResponse } from "next/server";
import { validIngredientQuantity } from "@/lib/business-flow";
import mongoose, { ClientSession, Types, isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { packingSnapshot, toBaseUnitCost } from "@/lib/inventory-units";
import { calculateProductionBatchCost } from "@/lib/production-costing";
import { productionCompanyCost, weightedCompanyCost } from "@/lib/company-cost";
import { requirePermission } from "@/lib/require-permission";
import { findAuthorizedPosOutlet } from "@/lib/pos-outlet-access";
import { ensureDefaultExpenseTypes } from "@/lib/expense-types";
import { isOperatingExpense, isSellingExpense, productUsage, type ProductUsage } from "@/lib/product-usage";
import OutletInventoryModel from "@/models/OutletInventory";
import OutletMenuItemModel from "@/models/OutletMenuItem";
import OutletStockTransactionModel from "@/models/OutletStockTransaction";
import ExpenseModel from "@/models/Expense";
import Product from "@/models/Product";
import BodegaProduct from "@/models/BodegaProduct";

export const dynamic = "force-dynamic";

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
  await ensureDefaultExpenseTypes();

  const body = await req.json().catch(() => null) as any;
  const outletId = String(body?.outletId || "");
  if (!isValidObjectId(outletId) || !(await findAuthorizedPosOutlet(session!.user.id, outletId))) {
    return NextResponse.json({ success: false, message: "Select an authorized outlet." }, { status: 400 });
  }
  const menuId = String(body?.menuItemId || "");
  const outputQty = Number(body?.outputQty || 0);
  const requestedSources = Array.isArray(body?.sources) && body.sources.length > 0
    ? body.sources
    : [{ inventoryId: body?.sourceInventoryId, quantity: body?.sourceQty }];
  const quantitiesByInventory = new Map<string, number>();
  for (const requested of requestedSources) {
    const inventoryId = String(requested?.inventoryId || "");
    const quantity = Number(requested?.quantity ?? requested?.qty ?? 0);
    if (!isValidObjectId(inventoryId) || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ success: false, message: "Every ingredient must have a valid positive quantity." }, { status: 400 });
    }
    quantitiesByInventory.set(inventoryId, (quantitiesByInventory.get(inventoryId) || 0) + quantity);
  }
  const ingredients = [...quantitiesByInventory].map(([inventoryId, quantity]) => ({ inventoryId, quantity }));
  if (!isValidObjectId(menuId) || ingredients.length < 1 || !Number.isSafeInteger(outputQty) || outputQty < 1) {
    return NextResponse.json({ success: false, message: "Select at least one ingredient and an output product, then enter valid whole quantities." }, { status: 400 });
  }

  async function performMixing(mongoSession?: ClientSession) {
    const sessionOptions = mongoSession ? { session: mongoSession } : {};
    // Commands sharing a transaction session must execute sequentially.
    const sources = await OutletInventoryModel.find({ _id: { $in: ingredients.map((item) => item.inventoryId) }, outletId, isActive: true }).session(mongoSession || null);
    const menu = await OutletMenuItemModel.findOne({ _id: menuId, outletId, isActive: true }).session(mongoSession || null);
    if (!menu || sources.length !== ingredients.length) throw new Error("One or more selected mixing products are unavailable.");

    const sourceById = new Map(sources.map((source) => [String(source._id), source]));
    for (const ingredient of ingredients) {
      const source = sourceById.get(ingredient.inventoryId);
      if (!source) throw new Error("One or more selected mixing products are unavailable.");
      if (!validIngredientQuantity(ingredient.quantity, source.unitLabel)) throw new Error(`${source.productName}: pieces and heads must be whole; measured ingredients must have a positive quantity.`);
      if (Number(source.stockQty || 0) < ingredient.quantity) {
        throw new Error(`${source.productName} has only ${source.stockQty} available.`);
      }
    }

    // Resolve master product usage for each source to classify transactions
    const groceryProductIds = sources.filter((s) => s.productSource === "GROCERY").map((s) => s.productId);
    const bodegaProductIds = sources.filter((s) => s.productSource === "BODEGA").map((s) => s.productId);

    const [groceryProducts, bodegaProducts] = await Promise.all([
      groceryProductIds.length ? Product.find({ _id: { $in: groceryProductIds } }).select("usage name").session(mongoSession || null).lean() : [],
      bodegaProductIds.length ? BodegaProduct.find({ _id: { $in: bodegaProductIds } }).select("usage name").session(mongoSession || null).lean() : [],
    ]);

    const usageMap = new Map<string, ProductUsage>();
    for (const p of groceryProducts) usageMap.set(`GROCERY:${p._id}`, productUsage((p as any).usage));
    for (const p of bodegaProducts) usageMap.set(`BODEGA:${p._id}`, productUsage((p as any).usage));

    // Separate ingredients into Production Cost vs Selling Expenses vs Operating Expenses
    const productionIngredients: typeof ingredients = [];
    const sellingExpenseIngredients: typeof ingredients = [];
    const operatingExpenseIngredients: typeof ingredients = [];

    for (const ingredient of ingredients) {
      const source = sourceById.get(ingredient.inventoryId)!;
      const usage = usageMap.get(`${source.productSource}:${source.productId}`) || "UNASSIGNED";
      if (isSellingExpense(usage)) {
        sellingExpenseIngredients.push(ingredient);
      } else if (isOperatingExpense(usage)) {
        operatingExpenseIngredients.push(ingredient);
      } else {
        productionIngredients.push(ingredient);
      }
    }

    if (productionIngredients.length === 0) {
      throw new Error("Select at least one production cost ingredient (e.g. chicken, marinade, breading mix) to produce a menu product.");
    }

    const referenceId = new Types.ObjectId();
    const costing = calculateProductionBatchCost({
      ingredients: productionIngredients.map((ingredient) => ({
        inventoryId: ingredient.inventoryId,
        quantity: ingredient.quantity,
        unitCost: baseCost(sourceById.get(ingredient.inventoryId)),
      })),
      outputQty,
    });

    let target = await OutletInventoryModel.findOne({ outletId, productId: menu._id, isActive: true }).session(mongoSession || null);
    // Names are not identities: a raw ingredient can share the menu name.
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
    target.companyUnitCost = weightedCompanyCost(
      targetBefore,
      target.companyUnitCost,
      outputQty,
      productionCompanyCost(productionIngredients.map(ingredient => ({ quantity: ingredient.quantity, companyUnitCost: sourceById.get(ingredient.inventoryId)?.companyUnitCost })), outputQty)
    );
    target.originType = "OUTLET_PRODUCTION";
    const existingUnitCost = baseCost(target);
    const weighted = calculateProductionBatchCost({
      ingredients: productionIngredients.map((ingredient) => ({
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
    target.unitLabel = "QTY";
    target.packSize = 0;
    target.sellingPrice = Number(menu.price || 0);
    await target.save(sessionOptions);

    const now = new Date();
    let totalSellingExpenses = 0;
    let totalOperatingExpenses = 0;
    const expenseRecords: any[] = [];

    // Selling Expenses (Packaging, paper bags, boxes) directly recorded as Outlet Expenses
    for (const ingredient of sellingExpenseIngredients) {
      const source = sourceById.get(ingredient.inventoryId)!;
      const lineCost = Math.round(ingredient.quantity * baseCost(source) * 100) / 100;
      totalSellingExpenses += lineCost;
      if (lineCost > 0) {
        expenseRecords.push({
          outletId,
          expenseCategory: "OUTLET",
          type: "SELLING_EXPENSES",
          name: `${source.productName} (Packaging / Selling Expense)`,
          amount: lineCost,
          expenseDate: now,
          origin: "PRODUCTION_USAGE",
          deductFromCashSale: false,
          expenseNature: "PERIOD_EXPENSE",
          remarks: `Batch packaging for ${menu.name} (Qty: ${outputQty})`,
          isActive: true,
          createdBy: session!.user.id,
        });
      }
    }

    // Operating Expenses (Store supplies, cleaning) directly recorded as Outlet Expenses
    for (const ingredient of operatingExpenseIngredients) {
      const source = sourceById.get(ingredient.inventoryId)!;
      const lineCost = Math.round(ingredient.quantity * baseCost(source) * 100) / 100;
      totalOperatingExpenses += lineCost;
      if (lineCost > 0) {
        expenseRecords.push({
          outletId,
          expenseCategory: "OUTLET",
          type: "OPERATING_EXPENSES",
          name: `${source.productName} (Operating Supplies)`,
          amount: lineCost,
          expenseDate: now,
          origin: "PRODUCTION_USAGE",
          deductFromCashSale: false,
          expenseNature: "PERIOD_EXPENSE",
          remarks: `Batch supplies for ${menu.name} (Qty: ${outputQty})`,
          isActive: true,
          createdBy: session!.user.id,
        });
      }
    }

    if (expenseRecords.length > 0) {
      await ExpenseModel.insertMany(expenseRecords, sessionOptions);
    }

    // Deduct stock for all used items and record stock movement transactions
    const movements = [];
    for (const ingredient of ingredients) {
      const source = sourceById.get(ingredient.inventoryId)!;
      const sourceBefore = Number(source.stockQty || 0);
      const usage = usageMap.get(`${source.productSource}:${source.productId}`) || "UNASSIGNED";
      source.stockQty = sourceBefore - ingredient.quantity;
      await source.save(sessionOptions);
      const usageTag = isSellingExpense(usage)
        ? "SELLING EXPENSE"
        : isOperatingExpense(usage)
          ? "OPERATING EXPENSE"
          : "PRODUCTION COST";
      movements.push({
        outletId,
        outletInventoryId: source._id,
        productSource: source.productSource,
        productId: source.productId,
        productName: source.productName,
        transactionDate: now,
        type: "REPACK_OUT",
        quantity: ingredient.quantity,
        unitCost: baseCost(source),
        entryUnit: source.unitLabel,
        entryQty: ingredient.quantity,
        multiplier: 1,
        baseUnit: source.productSource === "GROCERY" ? "QTY" : source.unitLabel === "HEAD" ? "HEAD" : "PCS",
        previousStock: sourceBefore,
        newStock: source.stockQty,
        referenceType: "REPACK",
        referenceId,
        sourceChannel: "WEB",
        remarks: String(body?.remarks || `POS PRODUCT MIXING: ${menu.name} [${usageTag}]`),
        createdBy: session!.user.id,
      });
    }

    movements.push({
      outletId,
      outletInventoryId: target._id,
      productSource: target.productSource,
      productId: target.productId,
      productName: target.productName,
      transactionDate: now,
      type: "REPACK_IN",
      quantity: outputQty,
      unitCost: costing.producedUnitCost,
      entryUnit: "QTY",
      entryQty: outputQty,
      multiplier: 1,
      baseUnit: "QTY",
      previousStock: targetBefore,
      newStock: target.stockQty,
      referenceType: "REPACK",
      referenceId,
      sourceChannel: "WEB",
      remarks: String(body?.remarks || `POS PRODUCT MIXING OUTPUT: ${menu.name}`),
      createdBy: session!.user.id,
    });
    await OutletStockTransactionModel.insertMany(movements, sessionOptions);

    return {
      costing,
      weighted,
      totalSellingExpenses: Math.round(totalSellingExpenses * 100) / 100,
      totalOperatingExpenses: Math.round(totalOperatingExpenses * 100) / 100,
      totalExpenses: Math.round((totalSellingExpenses + totalOperatingExpenses) * 100) / 100,
    };
  }

  const mongoSession = await mongoose.startSession();
  try {
    const result = await mongoSession.withTransaction(() => performMixing(mongoSession));
    const expenseNotes = result.totalExpenses > 0
      ? ` and recorded ₱${result.totalExpenses.toFixed(2)} in Outlet Expenses`
      : "";
    return NextResponse.json({
      success: true,
      message: `Production batch saved: ${outputQty} units produced. Allocated ₱${result.costing.totalBatchCost.toFixed(2)} to product inventory cost (₱${result.costing.producedUnitCost.toFixed(2)}/unit)${expenseNotes}.`,
      data: result,
    });
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
