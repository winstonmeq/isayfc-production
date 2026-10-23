import ExpenseTypeModel from "@/models/ExpenseType";

export const DEFAULT_EXPENSE_TYPES = [
  ["DELIVERY_EXPENSES", "Delivery Expenses"],
  ["CLEANING_SUPPLIES", "Cleaning Supplies"],
  ["TRANSPORTATION_EXPENSES", "Transportation Expenses"],
  ["MARINATE_EXPENSES", "Marinate Expenses"],
  ["OFFICE_SUPPLIES", "Office Supplies"],
  ["REPAIR_AND_MAINTENANCE", "Repair & Maintenance"],
  ["SALARIES", "Salaries"],
  ["INCENTIVES_AND_ALLOWANCES", "Incentives & Allowances"],
  ["OTHERS", "Others"],
] as const;

export function expenseTypeCode(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export async function ensureDefaultExpenseTypes() {
  await ExpenseTypeModel.bulkWrite(
    DEFAULT_EXPENSE_TYPES.map(([code, name]) => ({
      updateOne: {
        filter: { code },
        update: { $setOnInsert: { code, name, isSystem: true, isActive: true } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}
