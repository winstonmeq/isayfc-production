import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import CategoryModel from "@/models/Category";
import CustomerModel from "@/models/Customer";
import ExpenseModel from "@/models/Expense";
import ProductModel from "@/models/Product";
import SaleModel from "@/models/Sale";
import SaleLineModel from "@/models/SaleLine";

function cleanString(value: string | null | undefined) {
  return String(value || "").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function wholeNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toId(value: unknown) {
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

function getCategoryName(product: any) {
  return (
    product?.categoryName ||
    product?.categoryId?.name ||
    product?.category?.name ||
    "NO CATEGORY"
  );
}

function getLineQty(line: any) {
  return wholeNumber(line.baseQty ?? line.stockPcsOut ?? line.qty ?? line.quantity ?? 0);
}

function getLinePrice(line: any) {
  return numberValue(line.price || line.unitPrice || 0);
}

function getLineTotal(line: any) {
  const savedTotal = numberValue(line.lineTotal || line.totalAmount || 0);
  if (savedTotal > 0) return roundMoney(savedTotal);
  return roundMoney(getLineQty(line) * getLinePrice(line));
}

function buildDateRangeFilter(dateFrom: string, dateTo: string) {
  const dateFilter: Record<string, Date> = {};

  if (dateFrom) {
    dateFilter.$gte = new Date(`${dateFrom}T00:00:00+08:00`);
  }

  if (dateTo) {
    dateFilter.$lt = new Date(
      new Date(`${dateTo}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000
    );
  }

  return dateFilter;
}

async function getTotalGroceryExpenses(dateFrom: string, dateTo: string) {
  const filter: Record<string, any> = {
    isActive: true,
    expenseCategory: "GROCERY",
  };

  if (dateFrom || dateTo) {
    filter.expenseDate = buildDateRangeFilter(dateFrom, dateTo);
  }

  const expenses = await ExpenseModel.find(filter).select("amount").lean();

  return roundMoney(
    expenses.reduce((sum, expense: any) => sum + numberValue(expense.amount), 0)
  );
}

async function getFilterOptions() {
  const [products, categories] = await Promise.all([
    ProductModel.find({ isActive: true })
      .populate("categoryId", "name")
      .select("_id name categoryId")
      .sort({ name: 1 })
      .lean(),
    CategoryModel.find({ isActive: true }).select("_id name").sort({ name: 1 }).lean(),
  ]);

  return {
    products: products.map((product: any) => ({
      _id: toId(product._id),
      name: String(product.name || ""),
      categoryId: toId(product.categoryId?._id || product.categoryId),
      categoryName: getCategoryName(product),
    })),
    categories: categories.map((category: any) => ({
      _id: toId(category._id),
      name: String(category.name || ""),
    })),
  };
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
  const categoryId = cleanString(searchParams.get("categoryId"));
  const productId = cleanString(searchParams.get("productId"));
  const customer = cleanString(searchParams.get("customer"));
  const receiptNumber = cleanString(searchParams.get("receiptNumber"));
  const search = cleanString(searchParams.get("search"));

  const saleFilter: Record<string, any> = {
    isVoided: false,
    source: "BODEGA",
  };

  if (dateFrom || dateTo) {
    saleFilter.saleDate = buildDateRangeFilter(dateFrom, dateTo);
  }

  if (receiptNumber) {
    saleFilter.receiptNumber = {
      $regex: escapeRegex(receiptNumber),
      $options: "i",
    };
  }

  if (customer) {
    const matchingCustomers = await CustomerModel.find({
      isActive: true,
      name: {
        $regex: escapeRegex(customer),
        $options: "i",
      },
    })
      .select("_id")
      .lean();

    saleFilter.customerId = {
      $in: matchingCustomers.map((item) => item._id),
    };
  }

  const sales = await SaleModel.find(saleFilter)
    .populate("customerId", "name")
    .select("_id receiptNumber saleDate customerId remarks")
    .sort({ saleDate: -1, createdAt: -1 })
    .lean();

  const saleIds = sales.map((sale) => sale._id);
  const saleById = new Map(sales.map((sale: any) => [toId(sale._id), sale]));
  const filterOptionsPromise = getFilterOptions();
  const groceryExpensesPromise = getTotalGroceryExpenses(dateFrom, dateTo);

  if (saleIds.length === 0) {
    const [filters, totalGroceryExpenses] = await Promise.all([
      filterOptionsPromise,
      groceryExpensesPromise,
    ]);

    return NextResponse.json({
      success: true,
      data: [],
      summary: {
        totalRows: 0,
        totalQty: 0,
        totalCapital: 0,
        totalGross: 0,
        grossProfit: 0,
        totalGroceryExpenses,
        netProfit: roundMoney(0 - totalGroceryExpenses),
        totalProfit: roundMoney(0 - totalGroceryExpenses),
      },
      filters,
    });
  }

  const lineFilter: Record<string, any> = {
    saleId: { $in: saleIds },
    source: "BODEGA",
    productId: { $exists: true, $ne: null },
  };

  if (productId && productId !== "ALL" && isValidObjectId(productId)) {
    lineFilter.productId = productId;
  }

  if (categoryId && categoryId !== "ALL" && isValidObjectId(categoryId)) {
    lineFilter.categoryId = categoryId;
  }

  if (search) {
    lineFilter.$or = [
      { productName: { $regex: escapeRegex(search), $options: "i" } },
      { categoryName: { $regex: escapeRegex(search), $options: "i" } },
    ];
  }

  const saleLines = await SaleLineModel.find(lineFilter)
    .sort({ createdAt: -1 })
    .lean();

  const productIds = Array.from(
    new Set(
      saleLines
        .map((line: any) => toId(line.productId))
        .filter((id) => isValidObjectId(id))
    )
  );

  const [products, filters, totalGroceryExpenses] = await Promise.all([
    ProductModel.find({ _id: { $in: productIds } })
      .populate("categoryId", "name")
      .select("_id name categoryId buyingPrice unitPrice")
      .lean(),
    filterOptionsPromise,
    groceryExpensesPromise,
  ]);

  const productById = new Map(products.map((product: any) => [toId(product._id), product]));

  const rows = saleLines
    .map((line: any) => {
      const sale = saleById.get(toId(line.saleId));
      if (!sale) return null;

      const product = productById.get(toId(line.productId));
      const qty = getLineQty(line);
      const unitCost =
        numberValue(line.unitCost) || numberValue(product?.buyingPrice);
      const unitPrice = getLinePrice(line) || numberValue(product?.unitPrice);
      const totalAmount = getLineTotal(line) || roundMoney(qty * unitPrice);
      const capital = roundMoney(qty * unitCost);
      const grossProfit = roundMoney(totalAmount - capital);
      const categoryName = String(line.categoryName || getCategoryName(product));
      const productName = String(line.productName || product?.name || "Unknown Product");

      return {
        _id: toId(line._id),
        saleId: toId(line.saleId),
        receiptNumber: String(sale.receiptNumber || ""),
        saleDate: sale.saleDate ? new Date(sale.saleDate).toISOString() : "",
        customerName: String(sale.customerId?.name || ""),
        categoryId: toId(line.categoryId || product?.categoryId?._id || product?.categoryId),
        categoryName,
        productId: toId(line.productId),
        productName,
        qty,
        unitCost,
        unitPrice,
        capital,
        totalAmount,
        grossProfit,
        remarks: String(line.remarks || sale.remarks || ""),
      };
    })
    .filter(Boolean) as Array<{
      _id: string;
      saleId: string;
      receiptNumber: string;
      saleDate: string;
      customerName: string;
      categoryId: string;
      categoryName: string;
      productId: string;
      productName: string;
      qty: number;
      unitCost: number;
      unitPrice: number;
      capital: number;
      totalAmount: number;
      grossProfit: number;
      remarks: string;
    }>;

  const baseSummary = rows.reduce(
    (total, row) => ({
      totalRows: total.totalRows + 1,
      totalQty: total.totalQty + row.qty,
      totalCapital: roundMoney(total.totalCapital + row.capital),
      totalGross: roundMoney(total.totalGross + row.totalAmount),
      grossProfit: roundMoney(total.grossProfit + row.grossProfit),
    }),
    {
      totalRows: 0,
      totalQty: 0,
      totalCapital: 0,
      totalGross: 0,
      grossProfit: 0,
    }
  );

  const netProfit = roundMoney(baseSummary.grossProfit - totalGroceryExpenses);

  return NextResponse.json({
    success: true,
    data: rows,
    summary: {
      ...baseSummary,
      totalGroceryExpenses,
      netProfit,
      totalProfit: netProfit,
    },
    filters,
  });
}
