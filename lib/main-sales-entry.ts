export type MainSaleProductType = "CHICKEN" | "BODEGA";
export type MainSaleProductFilter = "ALL" | MainSaleProductType;

export function filterMainSaleProducts<T extends { type: MainSaleProductType }>(products: T[], filter: MainSaleProductFilter) {
  return filter === "ALL" ? products : products.filter((product) => product.type === filter);
}

export function mainSaleSource(items: Array<{ type: MainSaleProductType }>): "CHICKEN" | "BODEGA" | "MIXED" {
  const types = new Set(items.map((item) => item.type));
  return types.size === 1 ? items[0].type : "MIXED";
}

export function canonicalMainSaleRoute(href: string) {
  return href === "/sales" || href === "/sales/grocery" ? "/sales/all" : href;
}
