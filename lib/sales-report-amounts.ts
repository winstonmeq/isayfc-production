export type SalesAmountSnapshot = {
  lineTotal?: number | null;
  totalAmount?: number | null;
  grossLineTotal?: number | null;
  subtotal?: number | null;
  discountAmount?: number | null;
};

/** Read posted amounts; current discount rules must never change historical reports. */
export function salesReportAmounts(row: SalesAmountSnapshot) {
  const cents = (value: number) => Math.round(value * 100);
  const net = cents(Number(row.lineTotal ?? row.totalAmount ?? 0));
  const savedGross = row.grossLineTotal ?? row.subtotal;
  const discount = cents(Number(row.discountAmount ?? (savedGross == null ? 0 : Math.max(0, Number(savedGross) - net / 100))));
  return { grossSales: (net + discount) / 100, discounts: discount / 100, netSales: net / 100 };
}

export function discountReportSummary(rows: (SalesAmountSnapshot & { discountName?: string | null })[]) {
  const groups = new Map<string, { name: string; lines: number; amount: number }>();
  for (const row of rows) {
    const { discounts } = salesReportAmounts(row);
    if (discounts <= 0) continue;
    const name = row.discountName || "Other / legacy discounts";
    const group = groups.get(name) || { name, lines: 0, amount: 0 };
    group.lines++;
    group.amount = Math.round((group.amount + discounts) * 100) / 100;
    groups.set(name, group);
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
