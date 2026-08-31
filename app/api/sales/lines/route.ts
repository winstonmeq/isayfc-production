// app/api/sales/lines/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { cleanString, escapeRegex, getPagination } from "@/lib/crud-utils";
import { requirePermission } from "@/lib/require-permission";

import BodegaProductModel from "@/models/BodegaProduct";
import CustomerModel from "@/models/Customer";
import ProductModel from "@/models/Product";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";
import {
  getOutletCode,
  getSaleOrigin,
  getSaleSourceLabel,
} from "@/lib/sale-origin";
import OutletModel from "@/models/Outlet";

function splitValues(value: string) {
  return value
    .split(",")
    .map((item) => cleanString(item))
    .filter(Boolean);
}

function normalize(value: string) {
  return cleanString(value).replace(/\s+/g, " ").toLowerCase();
}

function getId(value: any) {
  return value?._id?.toString?.() || value?.toString?.() || "";
}

function getCategoryName(product: any) {
  return (
    product?.categoryName ||
    product?.categoryId?.name ||
    product?.category?.name ||
    ""
  );
}

function getQty(line: any) {
  return Number(line.qty ?? line.quantity ?? line.packs ?? 0);
}

function getPrice(line: any) {
  return Number(line.price ?? line.unitPrice ?? line.pricePerPack ?? 0);
}

function getLineTotal(line: any) {
  const savedTotal = Number(line.lineTotal ?? line.totalAmount ?? 0);

  if (savedTotal > 0) return savedTotal;

  return getQty(line) * getPrice(line);
}

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("sales-lines.view");

  if (response) return response;

  await dbConnect();
  void OutletModel;

  const { searchParams } = new URL(req.url);
  const { page, limit } = getPagination(searchParams);

  const dateFrom = cleanString(searchParams.get("dateFrom"));
  const dateTo = cleanString(searchParams.get("dateTo"));
  const receiptNumber = cleanString(searchParams.get("receiptNumber"));
  const customer = cleanString(searchParams.get("customer"));
  const source = cleanString(searchParams.get("source")).toUpperCase();

  const categoryNames = splitValues(cleanString(searchParams.get("categoryNames")));
  const productNames = splitValues(cleanString(searchParams.get("productNames")));

  const saleFilter: Record<string, any> = {
    isVoided: false,
  };

  if (source === "OUTLET") {
    saleFilter.$or = [
      { source: "OUTLET" },
      { channel: "MOBILE" },
      { receiptNumber: { $regex: "^MOB-", $options: "i" } },
      { remarks: { $regex: "MOBILE SALE OUTLET:", $options: "i" } },
    ];
  } else if (
    source === "CHICKEN" ||
    source === "GROCERY" ||
    source === "MIXED"
  ) {
    saleFilter.source = source === "GROCERY" ? "BODEGA" : source;
    saleFilter.$nor = [
      { source: "OUTLET" },
      { channel: "MOBILE" },
      { receiptNumber: { $regex: "^MOB-", $options: "i" } },
      { remarks: { $regex: "MOBILE SALE OUTLET:", $options: "i" } },
    ];
  }

  if (dateFrom || dateTo) {
    saleFilter.saleDate = {};

    if (dateFrom) {
      saleFilter.saleDate.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
    }

    if (dateTo) {
      saleFilter.saleDate.$lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
  }

  if (receiptNumber) {
    saleFilter.receiptNumber = {
      $regex: escapeRegex(receiptNumber),
      $options: "i",
    };
  }

  if (customer) {
    const customers = await CustomerModel.find({
      isActive: true,
      name: {
        $regex: escapeRegex(customer),
        $options: "i",
      },
    })
      .select("_id")
      .lean();

    saleFilter.customerId = {
      $in: customers.map((item) => item._id),
    };
  }

  const sales = await SaleModel.find(saleFilter)
    .populate("customerId", "name")
    .populate("outletId", "name code")
    .sort({ saleDate: -1, createdAt: -1 })
    .lean();

  const saleIds = sales.map((sale) => sale._id);

  if (saleIds.length === 0) {
    return NextResponse.json({
      success: true,
      data: [],
      summary: {
        rows: 0,
        totalAmount: 0,
      },
      meta: {
        page,
        limit,
        total: 0,
        totalPages: 1,
      },
    });
  }

  const saleMap = new Map<string, any>();

  for (const sale of sales) {
    saleMap.set(sale._id.toString(), sale);
  }

  const lineFilter: Record<string, any> = {
    saleId: {
      $in: saleIds,
    },
  };
  if (source === "CHICKEN") lineFilter.source = "CHICKEN";
  if (source === "GROCERY") lineFilter.source = "BODEGA";

  const saleLines = await SaleLineModel.find(lineFilter)
    .sort({ createdAt: -1 })
    .lean();

  const productIds = Array.from(
    new Set(
      saleLines
        .map((line: any) => getId(line.bodegaProductId || line.productId))
        .filter((id) => Types.ObjectId.isValid(id))
    )
  );

  const [bodegaProducts, products] = await Promise.all([
    BodegaProductModel.find({
      _id: {
        $in: productIds,
      },
    })
      .populate("categoryId", "name")
      .lean(),

    ProductModel.find({
      _id: {
        $in: productIds,
      },
    })
      .populate("categoryId", "name")
      .lean(),
  ]);

  const productMap = new Map<
    string,
    {
      name: string;
      categoryName: string;
    }
  >();

  for (const product of bodegaProducts) {
    productMap.set(product._id.toString(), {
      name: product.name || "",
      categoryName: getCategoryName(product),
    });
  }

  for (const product of products) {
    const id = product._id.toString();

    if (!productMap.has(id)) {
      productMap.set(id, {
        name: product.name || "",
        categoryName: getCategoryName(product),
      });
    }
  }

  const categoryFilterSet = new Set(categoryNames.map(normalize));
  const productFilterSet = new Set(productNames.map(normalize));

  const enrichedLines = saleLines
    .map((line: any) => {
      const saleId = getId(line.saleId);
      const sale = saleMap.get(saleId);

      if (!sale) return null;

      const productId = getId(line.bodegaProductId || line.productId);
      const productInfo = productMap.get(productId);

      const productName =
        line.productName || productInfo?.name || "Unknown Product";

      const categoryName =
        line.categoryName || productInfo?.categoryName || "NO CATEGORY";

      const qty = getQty(line);
      const price = getPrice(line);
      const lineTotal = getLineTotal(line);
      const saleOrigin = getSaleOrigin(sale);
      const displaySource =
        saleOrigin === "OUTLET"
          ? getSaleSourceLabel(sale)
          : line.source === "CHICKEN"
            ? "CHICKEN"
            : "GROCERY";

      return {
        _id: line._id.toString(),
        saleId,
        receiptNumber: sale.receiptNumber || "",
        saleDate: sale.saleDate
          ? new Date(sale.saleDate).toISOString()
          : undefined,
        customerName: sale.customerId?.name || "Walk-in",
        source: displaySource,
        outletCode: getOutletCode(sale),
        outletName: sale.outletId?.name || "",
        inventorySource: line.source || sale.source || "",
        categoryName,
        productName,
        qty,
        price,
        lineTotal,
        remarks: line.remarks || sale.remarks || "",
      };
    })
    .filter(Boolean) as any[];

  const filteredLines = enrichedLines.filter((line) => {
    const categoryOk =
      categoryFilterSet.size === 0 ||
      categoryFilterSet.has(normalize(line.categoryName));

    const productOk =
      productFilterSet.size === 0 ||
      productFilterSet.has(normalize(line.productName));

    return categoryOk && productOk;
  });

  filteredLines.sort((a, b) => {
    const dateA = a.saleDate ? new Date(a.saleDate).getTime() : 0;
    const dateB = b.saleDate ? new Date(b.saleDate).getTime() : 0;

    return dateB - dateA;
  });

  const total = filteredLines.length;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const skip = (page - 1) * limit;
  const paginatedLines = filteredLines.slice(skip, skip + limit);

  const summary = filteredLines.reduce(
    (sum, line) => ({
      rows: sum.rows + 1,
      totalQty: sum.totalQty + Number(line.qty || 0),
      totalPrice: sum.totalPrice + Number(line.price || 0),
      totalAmount: sum.totalAmount + Number(line.lineTotal || 0),
    }),
    {
      rows: 0,
      totalQty: 0,
      totalPrice: 0,
      totalAmount: 0,
    }
  );

  return NextResponse.json({
    success: true,
    data: paginatedLines,
    summary,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  });
}
