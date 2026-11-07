type Stock = { productId?: unknown; originType?: string; remarks?: string };
type Menu = { _id: unknown; price?: number; isActive?: boolean; isAvailable?: boolean };

/** Presentation only: never infer finished stock from a matching product name. */
export function outletInventoryView(stock: Stock, menu?: Menu) {
  const linked = !!menu && String(stock.productId) === String(menu._id);
  const finished = stock.originType === "OUTLET_PRODUCTION" || linked || String(stock.remarks || "").includes("MIXING OUTPUT");
  return {
    stockKind: finished ? "FINISHED" as const : "INGREDIENT" as const,
    sellingPrice: linked ? Number(menu.price || 0) : null,
    menuAvailable: linked && menu.isActive === true && menu.isAvailable === true,
  };
}

export type OutletInventoryTab = "ALL" | "INGREDIENT" | "FINISHED";
export function filterOutletInventory<T extends { productName: string; categoryName: string; productSource: string; stockKind?: string }>(items: T[], tab: OutletInventoryTab, query: string) {
  const search = query.trim().toLowerCase();
  return items.filter(item => (tab === "ALL" || (item.stockKind || "INGREDIENT") === tab) && `${item.productName} ${item.categoryName} ${item.productSource}`.toLowerCase().includes(search));
}
