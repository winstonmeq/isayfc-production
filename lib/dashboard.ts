// lib/dashboard.ts
import dbConnect from "@/lib/mongodb";
import BodegaProductModel from "@/models/BodegaProduct";
import CustomerModel from "@/models/Customer";
import DeliveryModel from "@/models/Delivery";
import ExpenseModel from "@/models/Expense";
import OutletModel from "@/models/Outlet";
import OutletInventoryModel from "@/models/OutletInventory";
import PaymentModel from "@/models/Payment";
import PurchaseBatchModel from "@/models/PurchaseBatch";
import SaleModel from "@/models/Sale";
import SupplierModel from "@/models/Supplier";
import SlicingBatchModel from "@/models/SlicingBatch";
import StandardPackingModel from "@/models/StandardPacking";
import {
  addDays,
  startOfDayManila,
  startOfMonthManila,
  startOfNextMonthManila,
} from "@/lib/date-utils";

type AnyRecord = Record<string, any>;

export type DashboardStockProduct = {
  id: string;
  name: string;
  kind: "SLICED" | "WHOLE" | "REGULAR";
  stockQty: number;
  packSize: number;
  packs: number;
  loosePcs: number;
  display: string;
  detail: string;
  buyingPrice: number;
  sellingPrice: number;
  inventoryCostValue: number;
  inventorySellingValue: number;
  status: "good" | "low" | "out";
};

export type DashboardActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  amount?: number;
  date: string;
  status?: string;
};

export type DashboardOutlet = {
  id: string;
  name: string;
  code: string;
  itemCount: number;
  stockValue: number;
};

export type DashboardSummary = {
  generatedAt: string;
  totalCustomers: number;
  totalSuppliers: number;
  totalSales: number;
  totalPayments: number;
  totalExpenses: number;
  totalBodegaExpenses: number;
  totalGroceryExpenses: number;
  outstandingReceivables: number;
  totalSupplierDeliveries: number;
  totalPurchaseBatches: number;
  totalStockInPurchases: number;
  totalDeliveries: number;
  today: {
    sales: number;
    payments: number;
    expenses: number;
    bodegaExpenses: number;
    groceryExpenses: number;
    operatingCash: number;
    supplierDeliveries: number;
    purchaseBatches: number;
    stockInPurchases: number;
    slicingHeads: number;
    slicingPacks: number;
    slicingActualPcs: number;
    salesCount: number;
    paymentCount: number;
    expenseCount: number;
    slicingCount: number;
  };
  yesterday: {
    sales: number;
    payments: number;
    expenses: number;
    operatingCash: number;
  };
  thisMonth: {
    sales: number;
    payments: number;
    expenses: number;
    bodegaExpenses: number;
    groceryExpenses: number;
    operatingCash: number;
    supplierDeliveries: number;
    purchaseBatches: number;
    stockInPurchases: number;
    slicingHeads: number;
    slicingPacks: number;
    slicingActualPcs: number;
  };
  outlets: {
    totalOutlets: number;
    activeOutlets: number;
    totalStockValue: number;
    totalItems: number;
    topOutlets: DashboardOutlet[];
  };
  bodegaStock: {
    totalPcs: number;
    totalCostValue: number;
    totalSellingValue: number;
    slicedProductCount: number;
    wholeChickenCount: number;
    regularProductCount: number;
    lowStockCount: number;
    outOfStockCount: number;
    lowStockProducts: DashboardStockProduct[];
    topInventoryProducts: DashboardStockProduct[];
  };
  recent: {
    sales: DashboardActivityItem[];
    payments: DashboardActivityItem[];
    expenses: DashboardActivityItem[];
    slicing: DashboardActivityItem[];
  };
};

const paymentAmountExpression = {
  $ifNull: [
    "$amountReceived",
    {
      $ifNull: [
        "$amountPaid",
        {
          $ifNull: ["$amount", 0],
        },
      ],
    },
  ],
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round(numberValue(value) * 100) / 100;
}

function notVoidedFilter() {
  return {
    $or: [
      { isVoided: { $exists: false } },
      { isVoided: false },
    ],
  };
}

function getDateRanges() {
  const now = new Date();
  const todayStart = startOfDayManila(now);
  const tomorrowStart = addDays(todayStart, 1);
  const yesterdayStart = addDays(todayStart, -1);

  const monthStart = startOfMonthManila(now);
  const nextMonthStart = startOfNextMonthManila(now);

  return {
    todayStart,
    tomorrowStart,
    yesterdayStart,
    monthStart,
    nextMonthStart,
  };
}

function withDateRange(
  baseFilter: Record<string, unknown>,
  dateField: string,
  startDate: Date,
  endDate: Date
) {
  return {
    ...baseFilter,
    [dateField]: {
      $gte: startDate,
      $lt: endDate,
    },
  };
}

async function sumAmount(
  model: any,
  match: Record<string, unknown>,
  amountExpression: any
) {
  const result = await model.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: amountExpression },
      },
    },
  ]);

  return numberValue(result[0]?.total);
}

async function countDocuments(model: any, match: Record<string, unknown>) {
  return numberValue(await model.countDocuments(match));
}

function objectIdString(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toString" in value) {
    return String(value.toString());
  }
  return String(value);
}

function formatPackStock(stockQty: number, packSize: number) {
  const totalPcs = Math.max(0, Math.trunc(numberValue(stockQty)));
  const pcsPerPack = Math.max(0, Math.trunc(numberValue(packSize)));

  if (pcsPerPack <= 0) {
    return {
      packs: 0,
      loosePcs: totalPcs,
      display: `${totalPcs.toLocaleString("en-PH")} pcs`,
      detail: "No pack size configured",
    };
  }

  const packs = Math.floor(totalPcs / pcsPerPack);
  const loosePcs = totalPcs % pcsPerPack;

  return {
    packs,
    loosePcs,
    display: `${packs.toLocaleString("en-PH")} packs / ${loosePcs.toLocaleString("en-PH")} pcs loose`,
    detail: `${totalPcs.toLocaleString("en-PH")} pcs total - ${pcsPerPack.toLocaleString("en-PH")} pcs/pack`,
  };
}

function stockStatus(kind: "SLICED" | "WHOLE" | "REGULAR", stockQty: number, packSize: number) {
  if (stockQty <= 0) return "out" as const;

  if (kind === "SLICED" && packSize > 0) {
    return stockQty <= packSize * 3 ? "low" as const : "good" as const;
  }

  return stockQty <= 10 ? "low" as const : "good" as const;
}

async function buildBodegaStockSummary() {
  const products = await (BodegaProductModel as any)
    .find({ isActive: true })
    .select("name stockQty buyingPrice sellingPrice")
    .sort({ name: 1 })
    .lean();

  const standards = await (StandardPackingModel as any)
    .find({ isActive: true })
    .select("wholeChickenId productId standardPacking")
    .lean();

  const slicedPackSizeByProductId = new Map<string, number>();
  const wholeChickenProductIds = new Set<string>();

  for (const standard of standards as AnyRecord[]) {
    const productId = objectIdString(standard.productId);
    const wholeChickenId = objectIdString(standard.wholeChickenId);
    const packSize = Math.max(0, Math.trunc(numberValue(standard.standardPacking)));

    if (productId && packSize > 0 && !slicedPackSizeByProductId.has(productId)) {
      slicedPackSizeByProductId.set(productId, packSize);
    }

    if (wholeChickenId) {
      wholeChickenProductIds.add(wholeChickenId);
    }
  }

  const stockProducts = (products as AnyRecord[]).map((product) => {
    const id = objectIdString(product._id);
    const stockQty = Math.max(0, Math.trunc(numberValue(product.stockQty)));
    const buyingPrice = numberValue(product.buyingPrice);
    const sellingPrice = numberValue(product.sellingPrice);
    const packSize = numberValue(slicedPackSizeByProductId.get(id));
    const kind: "SLICED" | "WHOLE" | "REGULAR" = packSize > 0
      ? "SLICED"
      : wholeChickenProductIds.has(id)
        ? "WHOLE"
        : "REGULAR";

    const packStock = kind === "SLICED"
      ? formatPackStock(stockQty, packSize)
      : {
          packs: 0,
          loosePcs: 0,
          display: `${stockQty.toLocaleString("en-PH")} ${kind === "WHOLE" ? "heads" : "pcs"}`,
          detail: kind === "WHOLE" ? "Whole chicken stock" : "Regular bodega stock",
        };

    const status = stockStatus(kind, stockQty, packSize);
    const inventoryCostValue = roundMoney(stockQty * buyingPrice);
    const sellingUnitPrice = kind === "SLICED" && packSize > 0
      ? sellingPrice / packSize
      : sellingPrice;
    const inventorySellingValue = roundMoney(stockQty * sellingUnitPrice);

    return {
      id,
      name: String(product.name || "Unnamed Product"),
      kind,
      stockQty,
      packSize,
      packs: packStock.packs,
      loosePcs: packStock.loosePcs,
      display: packStock.display,
      detail: packStock.detail,
      buyingPrice,
      sellingPrice,
      inventoryCostValue,
      inventorySellingValue,
      status,
    } satisfies DashboardStockProduct;
  });

  const totalPcs = stockProducts.reduce((sum, product) => sum + product.stockQty, 0);
  const totalCostValue = stockProducts.reduce(
    (sum, product) => sum + product.inventoryCostValue,
    0
  );
  const totalSellingValue = stockProducts.reduce(
    (sum, product) => sum + product.inventorySellingValue,
    0
  );

  return {
    totalPcs,
    totalCostValue: roundMoney(totalCostValue),
    totalSellingValue: roundMoney(totalSellingValue),
    slicedProductCount: stockProducts.filter((product) => product.kind === "SLICED").length,
    wholeChickenCount: stockProducts.filter((product) => product.kind === "WHOLE").length,
    regularProductCount: stockProducts.filter((product) => product.kind === "REGULAR").length,
    lowStockCount: stockProducts.filter((product) => product.status === "low").length,
    outOfStockCount: stockProducts.filter((product) => product.status === "out").length,
    lowStockProducts: stockProducts
      .filter((product) => product.status !== "good")
      .sort((first, second) => {
        if (first.status === second.status) return first.stockQty - second.stockQty;
        return first.status === "out" ? -1 : 1;
      })
      .slice(0, 6),
    topInventoryProducts: stockProducts
      .sort((first, second) => second.inventoryCostValue - first.inventoryCostValue)
      .slice(0, 6),
  };
}

function activityDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

async function recentSales() {
  const rows = await (SaleModel as any)
    .find({ ...notVoidedFilter(), fulfillmentStatus: { $ne: "PENDING" } })
    .select("receiptNumber totalAmount balance status saleDate createdAt")
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  return (rows as AnyRecord[]).map((sale) => ({
    id: objectIdString(sale._id),
    title: sale.receiptNumber ? `Sale ${sale.receiptNumber}` : "Sale",
    subtitle: `${String(sale.status || "OPEN")} - Balance ${roundMoney(numberValue(sale.balance)).toLocaleString("en-PH")}`,
    amount: numberValue(sale.totalAmount),
    date: activityDate(sale.saleDate || sale.createdAt),
    status: String(sale.status || ""),
  }));
}

async function recentPayments() {
  const rows = await (PaymentModel as any)
    .find(notVoidedFilter())
    .select("referenceNumber amount amountReceived amountPaid paymentDate createdAt")
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  return (rows as AnyRecord[]).map((payment) => ({
    id: objectIdString(payment._id),
    title: payment.referenceNumber ? `Payment ${payment.referenceNumber}` : "Payment Received",
    subtitle: "Customer collection",
    amount: numberValue(payment.amountReceived ?? payment.amountPaid ?? payment.amount),
    date: activityDate(payment.paymentDate || payment.createdAt),
  }));
}

async function recentExpenses() {
  const rows = await (ExpenseModel as any)
    .find({ isActive: true })
    .select("name type expenseCategory amount expenseDate createdAt")
    .sort({ expenseDate: -1, createdAt: -1 })
    .limit(5)
    .lean();

  return (rows as AnyRecord[]).map((expense) => ({
    id: objectIdString(expense._id),
    title: String(expense.name || "Expense"),
    subtitle: `${String(expense.expenseCategory || "BODEGA").replaceAll("_", " ")} - ${String(expense.type || "OTHERS").replaceAll("_", " ")}`,
    amount: numberValue(expense.amount),
    date: activityDate(expense.expenseDate || expense.createdAt),
  }));
}

async function recentSlicing() {
  const rows = await (SlicingBatchModel as any)
    .find(notVoidedFilter())
    .select("slicingDate slicer packer totalHeads totalActualPcs totalPacks createdAt")
    .sort({ slicingDate: -1, createdAt: -1 })
    .limit(5)
    .lean();

  return (rows as AnyRecord[]).map((batch) => ({
    id: objectIdString(batch._id),
    title: `${numberValue(batch.totalPacks).toLocaleString("en-PH")} packs produced`,
    subtitle: `${numberValue(batch.totalHeads).toLocaleString("en-PH")} heads - ${numberValue(batch.totalActualPcs).toLocaleString("en-PH")} pcs`,
    date: activityDate(batch.slicingDate || batch.createdAt),
  }));
}

async function sumSlicing(
  startDate: Date,
  endDate: Date
): Promise<{ heads: number; packs: number; actualPcs: number; count: number }> {
  const result = await (SlicingBatchModel as any).aggregate([
    {
      $match: withDateRange(notVoidedFilter(), "slicingDate", startDate, endDate),
    },
    {
      $group: {
        _id: null,
        heads: { $sum: "$totalHeads" },
        packs: { $sum: "$totalPacks" },
        actualPcs: { $sum: "$totalActualPcs" },
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    heads: numberValue(result[0]?.heads),
    packs: numberValue(result[0]?.packs),
    actualPcs: numberValue(result[0]?.actualPcs),
    count: numberValue(result[0]?.count),
  };
}

async function buildOutletsSummary() {
  const [totalOutlets, activeOutlets, inventoryByOutlet, outlets] =
    await Promise.all([
      countDocuments(OutletModel, {}),
      countDocuments(OutletModel, { isActive: true, status: "ACTIVE" }),
      (OutletInventoryModel as any).aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: "$outletId",
            itemCount: { $sum: 1 },
            stockValue: {
              $sum: {
                $multiply: [
                  { $ifNull: ["$stockQty", 0] },
                  { $ifNull: ["$sellingPrice", 0] },
                ],
              },
            },
          },
        },
      ]),
      (OutletModel as any)
        .find({})
        .select("name code")
        .lean(),
    ]);

  const outletMeta = new Map<string, { name: string; code: string }>();
  for (const outlet of outlets as AnyRecord[]) {
    outletMeta.set(objectIdString(outlet._id), {
      name: String(outlet.name || ""),
      code: String(outlet.code || ""),
    });
  }

  let totalStockValue = 0;
  let totalItems = 0;

  const rows: DashboardOutlet[] = (inventoryByOutlet as AnyRecord[]).map(
    (row) => {
      const id = objectIdString(row._id);
      const meta = outletMeta.get(id);
      const stockValue = roundMoney(numberValue(row.stockValue));
      const itemCount = numberValue(row.itemCount);

      totalStockValue += stockValue;
      totalItems += itemCount;

      return {
        id,
        name: meta?.name || "Unknown outlet",
        code: meta?.code || "",
        itemCount,
        stockValue,
      };
    }
  );

  const topOutlets = rows
    .sort((a, b) => b.stockValue - a.stockValue)
    .slice(0, 5);

  return {
    totalOutlets,
    activeOutlets,
    totalStockValue: roundMoney(totalStockValue),
    totalItems,
    topOutlets,
  };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await dbConnect();

  const {
    todayStart,
    tomorrowStart,
    yesterdayStart,
    monthStart,
    nextMonthStart,
  } = getDateRanges();

  const activeFilter = { isActive: true };
  const saleFilter = {
    ...notVoidedFilter(),
    fulfillmentStatus: { $ne: "PENDING" },
  };
  const paymentFilter = notVoidedFilter();
  const deliveryFilter = notVoidedFilter();
  const purchaseBatchFilter = notVoidedFilter();
  const expenseFilter = { isActive: true };
  // BODEGA must include legacy expenses created before expenseCategory existed
  // (missing / null / empty), mirroring the Expenses API's categoryFilter.
  const bodegaExpenseFilter = {
    isActive: true,
    $or: [
      { expenseCategory: "BODEGA" },
      { expenseCategory: { $exists: false } },
      { expenseCategory: null },
      { expenseCategory: "" },
    ],
  };
  const groceryExpenseFilter = { isActive: true, expenseCategory: "GROCERY" };

  const [
    totalCustomers,
    totalSuppliers,
    totalSales,
    totalPayments,
    totalExpenses,
    totalSupplierDeliveries,
    totalPurchaseBatches,
    todaySales,
    todayPayments,
    todayExpenses,
    todaySupplierDeliveries,
    todayPurchaseBatches,
    yesterdaySales,
    yesterdayPayments,
    yesterdayExpenses,
    thisMonthSales,
    thisMonthPayments,
    thisMonthExpenses,
    thisMonthSupplierDeliveries,
    thisMonthPurchaseBatches,
    todaySalesCount,
    todayPaymentCount,
    todayExpenseCount,
    todaySlicing,
    thisMonthSlicing,
    bodegaStock,
    outletsSummary,
    totalBodegaExpenses,
    totalGroceryExpenses,
    todayBodegaExpenses,
    todayGroceryExpenses,
    thisMonthBodegaExpenses,
    thisMonthGroceryExpenses,
    salesActivity,
    paymentsActivity,
    expensesActivity,
    slicingActivity,
  ] = await Promise.all([
    countDocuments(CustomerModel, activeFilter),
    countDocuments(SupplierModel, activeFilter),
    sumAmount(SaleModel, saleFilter, "$totalAmount"),
    sumAmount(PaymentModel, paymentFilter, paymentAmountExpression),
    sumAmount(ExpenseModel, expenseFilter, "$amount"),
    sumAmount(DeliveryModel, deliveryFilter, "$totalAmount"),
    sumAmount(PurchaseBatchModel, purchaseBatchFilter, "$totalAmount"),
    sumAmount(SaleModel, withDateRange(saleFilter, "createdAt", todayStart, tomorrowStart), "$totalAmount"),
    sumAmount(PaymentModel, withDateRange(paymentFilter, "createdAt", todayStart, tomorrowStart), paymentAmountExpression),
    sumAmount(ExpenseModel, withDateRange(expenseFilter, "expenseDate", todayStart, tomorrowStart), "$amount"),
    sumAmount(DeliveryModel, withDateRange(deliveryFilter, "createdAt", todayStart, tomorrowStart), "$totalAmount"),
    sumAmount(PurchaseBatchModel, withDateRange(purchaseBatchFilter, "createdAt", todayStart, tomorrowStart), "$totalAmount"),
    sumAmount(SaleModel, withDateRange(saleFilter, "createdAt", yesterdayStart, todayStart), "$totalAmount"),
    sumAmount(PaymentModel, withDateRange(paymentFilter, "createdAt", yesterdayStart, todayStart), paymentAmountExpression),
    sumAmount(ExpenseModel, withDateRange(expenseFilter, "expenseDate", yesterdayStart, todayStart), "$amount"),
    sumAmount(SaleModel, withDateRange(saleFilter, "createdAt", monthStart, nextMonthStart), "$totalAmount"),
    sumAmount(PaymentModel, withDateRange(paymentFilter, "createdAt", monthStart, nextMonthStart), paymentAmountExpression),
    sumAmount(ExpenseModel, withDateRange(expenseFilter, "expenseDate", monthStart, nextMonthStart), "$amount"),
    sumAmount(DeliveryModel, withDateRange(deliveryFilter, "createdAt", monthStart, nextMonthStart), "$totalAmount"),
    sumAmount(PurchaseBatchModel, withDateRange(purchaseBatchFilter, "createdAt", monthStart, nextMonthStart), "$totalAmount"),
    countDocuments(SaleModel, withDateRange(saleFilter, "createdAt", todayStart, tomorrowStart)),
    countDocuments(PaymentModel, withDateRange(paymentFilter, "createdAt", todayStart, tomorrowStart)),
    countDocuments(ExpenseModel, withDateRange(expenseFilter, "expenseDate", todayStart, tomorrowStart)),
    sumSlicing(todayStart, tomorrowStart),
    sumSlicing(monthStart, nextMonthStart),
    buildBodegaStockSummary(),
    buildOutletsSummary(),
    sumAmount(ExpenseModel, bodegaExpenseFilter, "$amount"),
    sumAmount(ExpenseModel, groceryExpenseFilter, "$amount"),
    sumAmount(ExpenseModel, withDateRange(bodegaExpenseFilter, "expenseDate", todayStart, tomorrowStart), "$amount"),
    sumAmount(ExpenseModel, withDateRange(groceryExpenseFilter, "expenseDate", todayStart, tomorrowStart), "$amount"),
    sumAmount(ExpenseModel, withDateRange(bodegaExpenseFilter, "expenseDate", monthStart, nextMonthStart), "$amount"),
    sumAmount(ExpenseModel, withDateRange(groceryExpenseFilter, "expenseDate", monthStart, nextMonthStart), "$amount"),
    recentSales(),
    recentPayments(),
    recentExpenses(),
    recentSlicing(),
  ]);

  const totalStockInPurchases = totalSupplierDeliveries + totalPurchaseBatches;
  const todayStockInPurchases = todaySupplierDeliveries + todayPurchaseBatches;
  const thisMonthStockInPurchases = thisMonthSupplierDeliveries + thisMonthPurchaseBatches;
  const outstandingReceivables = Math.max(totalSales - totalPayments, 0);
  const todayOperatingCash = todayPayments - todayExpenses;
  const yesterdayOperatingCash = yesterdayPayments - yesterdayExpenses;
  const monthOperatingCash = thisMonthPayments - thisMonthExpenses;

  return {
    generatedAt: new Date().toISOString(),
    totalCustomers,
    totalSuppliers,
    totalSales: roundMoney(totalSales),
    totalPayments: roundMoney(totalPayments),
    totalExpenses: roundMoney(totalExpenses),
    totalBodegaExpenses: roundMoney(totalBodegaExpenses),
    totalGroceryExpenses: roundMoney(totalGroceryExpenses),
    outstandingReceivables: roundMoney(outstandingReceivables),
    totalSupplierDeliveries: roundMoney(totalSupplierDeliveries),
    totalPurchaseBatches: roundMoney(totalPurchaseBatches),
    totalStockInPurchases: roundMoney(totalStockInPurchases),
    totalDeliveries: roundMoney(totalSupplierDeliveries),
    today: {
      sales: roundMoney(todaySales),
      payments: roundMoney(todayPayments),
      expenses: roundMoney(todayExpenses),
      bodegaExpenses: roundMoney(todayBodegaExpenses),
      groceryExpenses: roundMoney(todayGroceryExpenses),
      operatingCash: roundMoney(todayOperatingCash),
      supplierDeliveries: roundMoney(todaySupplierDeliveries),
      purchaseBatches: roundMoney(todayPurchaseBatches),
      stockInPurchases: roundMoney(todayStockInPurchases),
      slicingHeads: numberValue(todaySlicing.heads),
      slicingPacks: numberValue(todaySlicing.packs),
      slicingActualPcs: numberValue(todaySlicing.actualPcs),
      salesCount: numberValue(todaySalesCount),
      paymentCount: numberValue(todayPaymentCount),
      expenseCount: numberValue(todayExpenseCount),
      slicingCount: numberValue(todaySlicing.count),
    },
    yesterday: {
      sales: roundMoney(yesterdaySales),
      payments: roundMoney(yesterdayPayments),
      expenses: roundMoney(yesterdayExpenses),
      operatingCash: roundMoney(yesterdayOperatingCash),
    },
    thisMonth: {
      sales: roundMoney(thisMonthSales),
      payments: roundMoney(thisMonthPayments),
      expenses: roundMoney(thisMonthExpenses),
      bodegaExpenses: roundMoney(thisMonthBodegaExpenses),
      groceryExpenses: roundMoney(thisMonthGroceryExpenses),
      operatingCash: roundMoney(monthOperatingCash),
      supplierDeliveries: roundMoney(thisMonthSupplierDeliveries),
      purchaseBatches: roundMoney(thisMonthPurchaseBatches),
      stockInPurchases: roundMoney(thisMonthStockInPurchases),
      slicingHeads: numberValue(thisMonthSlicing.heads),
      slicingPacks: numberValue(thisMonthSlicing.packs),
      slicingActualPcs: numberValue(thisMonthSlicing.actualPcs),
    },
    bodegaStock,
    outlets: outletsSummary,
    recent: {
      sales: salesActivity,
      payments: paymentsActivity,
      expenses: expensesActivity,
      slicing: slicingActivity,
    },
  };
}
