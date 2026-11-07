/** Product category describes the item, never its inventory/accounting source. */
export function isInventorySourceCategory(value: unknown) {
  return typeof value === "string" && ["BODEGA", "GROCERY", "OUTLET"].includes(value.trim().toUpperCase());
}
export const PRODUCT_CATEGORY_ERROR = "Choose a product category such as Chicken, Chicken Cuts, Plastic or Gloves. Bodega, Grocery and Outlet identify inventory sources, not product categories.";

export function bodegaSaleAvailability(product: { unitCode?: string; stockQty?: number; stockHeads?: number }, packSize: number) {
  const stock = Math.max(0, Number(product.stockQty || 0));
  const unit = product.unitCode === "KG" ? "KG" : packSize > 0 ? "PACK" : product.unitCode === "PCS" ? "QTY" : "HEAD";
  return { saleUnit: unit, availableQty: unit === "PACK" ? Math.floor(stock / packSize) : unit === "HEAD" ? Math.min(stock, Math.max(0, Math.trunc(Number(product.stockHeads || 0)))) : stock };
}
