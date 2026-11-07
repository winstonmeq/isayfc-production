import { NextRequest, NextResponse } from "next/server";
import { mainOperatingExpenseFilter } from "@/lib/main-expense-policy";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import BodegaProductModel from "@/models/BodegaProduct";
import ExpenseModel from "@/models/Expense";
import SlicingBatchModel from "@/models/SlicingBatch";
import SlicingItemModel from "@/models/SlicingItem";

function cleanString(value: string | null | undefined) {
  return String(value || "").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function toObjectIdString(value: unknown) {
  if (!value) return "";
  return String(value);
}

function hasProfitPermission(session: any) {
  const user = session?.user || {};
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  const legacyRole = String(user.role || "").toUpperCase();
  const roleName = String(user.roleName || "").toUpperCase();

  return (
    legacyRole === "ADMIN" ||
    roleName === "ADMIN" ||
    permissions.includes("reports.profit")
  );
}

function getBatchDate(batch: any) {
  if (!batch?.slicingDate) return "";
  return new Date(batch.slicingDate).toISOString();
}

function getProductPrice(product: any, field: "buyingPrice" | "sellingPrice") {
  return numberValue(product?.[field]);
}

function getBodegaExpenseCategoryFilter() {
  // Old expense records created before expenseCategory existed should still be
  // treated as Bodega expenses so historical reports remain accurate.
  return {
    $or: [
      { expenseCategory: "BODEGA" },
      { expenseCategory: { $exists: false } },
      { expenseCategory: null },
      { expenseCategory: "" },
    ],
  };
}

function buildBodegaExpenseFilter(dateFrom: string, dateTo: string) {
  const filter: Record<string, any> = {
    ...mainOperatingExpenseFilter(),
    ...getBodegaExpenseCategoryFilter(),
  };

  if (dateFrom || dateTo) {
    filter.expenseDate = {};

    if (dateFrom) {
      filter.expenseDate.$gte = new Date(`${dateFrom}T00:00:00+08:00`);
    }

    if (dateTo) {
      filter.expenseDate.$lt = new Date(
        new Date(`${dateTo}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000
      );
    }
  }

  return filter;
}

async function getTotalBodegaExpenses(dateFrom: string, dateTo: string) {
  const result = await ExpenseModel.aggregate([
    { $match: buildBodegaExpenseFilter(dateFrom, dateTo) },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$amount", 0] } },
      },
    },
  ]);

  return roundMoney(result[0]?.total || 0);
}

export async function GET(req: NextRequest) {
  const { response, session } = await requirePermission("reports.profit");
  if (response) return response;

  if (!hasProfitPermission(session)) {
    return NextResponse.json(
      { success: false, message: "You do not have permission to view profit reports." },
      { status: 403 }
    );
  }

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));
  const mainProductId = cleanString(searchParams.get("mainProductId"));
  const slicedProductId = cleanString(searchParams.get("slicedProductId"));
  const search = cleanString(searchParams.get("search"));
  const limitParam = Math.trunc(numberValue(searchParams.get("limit")));
  const limit = Math.min(Math.max(limitParam || 5000, 1), 20000);

  const batchFilter: Record<string, any> = { isVoided: false };

  if (dateFrom || dateTo) {
    batchFilter.slicingDate = {};

    if (dateFrom) {
      batchFilter.slicingDate.$gte = new Date(`${dateFrom}T00:00:00+08:00`);
    }

    if (dateTo) {
      batchFilter.slicingDate.$lt = new Date(
        new Date(`${dateTo}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000
      );
    }
  }

  const batches = await SlicingBatchModel.find(batchFilter)
    .select("_id slicingDate slicer packer")
    .lean();

  const batchIds = batches.map((batch) => batch._id);
  const batchById = new Map(
    batches.map((batch) => [String(batch._id), batch])
  );

  const itemFilter: Record<string, any> = {
    batchId: { $in: batchIds },
  };

  if (mainProductId && mainProductId !== "ALL" && isValidObjectId(mainProductId)) {
    itemFilter.mainProductId = mainProductId;
  }

  if (slicedProductId && slicedProductId !== "ALL" && isValidObjectId(slicedProductId)) {
    itemFilter.slicedProductId = slicedProductId;
  }

  if (search) {
    itemFilter.$or = [
      { mainProductName: { $regex: search, $options: "i" } },
      { slicedProductName: { $regex: search, $options: "i" } },
    ];
  }

  const items = await SlicingItemModel.find(itemFilter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const allProductIds = Array.from(
    new Set(
      items
        .flatMap((item: any) => [
          toObjectIdString(item.mainProductId),
          toObjectIdString(item.slicedProductId),
        ])
        .filter(Boolean)
    )
  );

  const products = await BodegaProductModel.find({ _id: { $in: allProductIds } })
    .select("_id name buyingPrice sellingPrice")
    .lean();

  const productById = new Map(products.map((product: any) => [String(product._id), product]));

  const mainProductsMap = new Map<string, { _id: string; name: string }>();
  const slicedProductsMap = new Map<string, { _id: string; name: string }>();

  const rows = items.map((item: any) => {
    const batch = batchById.get(String(item.batchId));
    const mainProduct = productById.get(String(item.mainProductId));
    const slicedProduct = productById.get(String(item.slicedProductId));

    const mainProductName = String(mainProduct?.name || item.mainProductName || "");
    const slicedProductName = String(slicedProduct?.name || item.slicedProductName || "");
    const mainProductIdValue = String(item.mainProductId || "");
    const slicedProductIdValue = String(item.slicedProductId || "");

    if (mainProductIdValue) {
      mainProductsMap.set(mainProductIdValue, {
        _id: mainProductIdValue,
        name: mainProductName,
      });
    }

    if (slicedProductIdValue) {
      slicedProductsMap.set(slicedProductIdValue, {
        _id: slicedProductIdValue,
        name: slicedProductName,
      });
    }

    const kilos = numberValue(item.kilos);
    const heads = numberValue(item.heads);
    const standardPacking = Math.trunc(numberValue(item.standardPacking));
    const standardSlice = Math.trunc(numberValue(item.standardSlice));
    const standardPcs = numberValue(item.totalStdPcs) || heads * standardSlice;
    const actualPcs = Math.trunc(numberValue(item.actualSlicedPcs));
    const actualPacks = Math.trunc(numberValue(item.actualPacks));
    const loosePcs = Math.trunc(numberValue(item.butal));
    const variance = numberValue(item.variance);

    const deliveryPrice =
      numberValue(item.inputUnitCost) ||
      getProductPrice(mainProduct, "buyingPrice");
    const pricePerPack =
      numberValue(item.outputUnitPrice) ||
      getProductPrice(slicedProduct, "sellingPrice");
    const pricePerPcs = standardPacking > 0 ? roundMoney(pricePerPack / standardPacking) : 0;

    // Sliced product sellingPrice is treated as PRICE PER PACK.
    // Example: C10 standardPacking = 50 pcs and sellingPrice = 377.
    // Price per pcs = 377 / 50 = 7.54.
    // Total amount/gross = full packs x price per pack + loose pcs x price per pcs.
    const capitalBaseQty = kilos > 0 ? kilos : heads;
    const capital =
      numberValue(item.inputCost) ||
      roundMoney(capitalBaseQty * deliveryPrice);
    const gross =
      numberValue(item.outputValue) ||
      roundMoney(actualPacks * pricePerPack + loosePcs * pricePerPcs);
    // Profit shown by this report must be based on the current report values.
    // Older slicing records can contain a stale recoveryProfit snapshot that
    // represented capital as a negative amount instead of gross less capital.
    const profit = roundMoney(gross - capital);

    return {
      _id: String(item._id),
      batchId: String(item.batchId || ""),
      date: getBatchDate(batch),
      mainProductId: mainProductIdValue,
      mainProductName,
      slicedProductId: slicedProductIdValue,
      slicedProductName,
      heads,
      kilos,
      deliveryPrice,
      standardSlice,
      standardPacking,
      standardPcs,
      actualPcs,
      actualPacks,
      loosePcs,
      variance,
      pricePerPcs,
      pricePerPack,
      capital,
      gross,
      profit,
      slicer: String(batch?.slicer || ""),
      packer: String(batch?.packer || ""),
    };
  });

  const baseSummary = rows.reduce(
    (total, row) => ({
      totalRows: total.totalRows + 1,
      totalHeads: total.totalHeads + row.heads,
      totalKilos: total.totalKilos + row.kilos,
      totalStandardPcs: total.totalStandardPcs + row.standardPcs,
      totalActualPcs: total.totalActualPcs + row.actualPcs,
      totalPacks: total.totalPacks + row.actualPacks,
      totalLoosePcs: total.totalLoosePcs + row.loosePcs,
      totalCapital: roundMoney(total.totalCapital + row.capital),
      totalGross: roundMoney(total.totalGross + row.gross),
      grossProfit: roundMoney(total.grossProfit + row.profit),
    }),
    {
      totalRows: 0,
      totalHeads: 0,
      totalKilos: 0,
      totalStandardPcs: 0,
      totalActualPcs: 0,
      totalPacks: 0,
      totalLoosePcs: 0,
      totalCapital: 0,
      totalGross: 0,
      grossProfit: 0,
    }
  );

  const totalBodegaExpenses = await getTotalBodegaExpenses(dateFrom, dateTo);
  const summary = {
    ...baseSummary,
    // Keep totalProfit as the final NET PROFIT for backward compatibility with
    // older UI code that already reads summary.totalProfit.
    totalBodegaExpenses,
    netProfit: roundMoney(baseSummary.grossProfit - totalBodegaExpenses),
    totalProfit: roundMoney(baseSummary.grossProfit - totalBodegaExpenses),
  };

  return NextResponse.json({
    success: true,
    data: rows,
    summary,
    filters: {
      mainProducts: Array.from(mainProductsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      slicedProducts: Array.from(slicedProductsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    },
  });
}
