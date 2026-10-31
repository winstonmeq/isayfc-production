import { cleanString, escapeRegex } from "./crud-utils";

export function deliveryProductMatch(value: unknown) {
  const product = cleanString(value);
  return product ? { productName: { $regex: escapeRegex(product), $options: "i" } } : null;
}

// Use receipt-time snapshots so renamed/deactivated products stay identifiable.
export function deliveryProductsById(lines: Array<{ deliveryId: unknown; productName?: unknown }>) {
  const products = new Map<string, Set<string>>();
  for (const line of lines) {
    const id = String(line.deliveryId || "");
    const name = String(line.productName || "").trim();
    if (!id || !name) continue;
    if (!products.has(id)) products.set(id, new Set());
    products.get(id)!.add(name);
  }
  return new Map([...products].map(([id, names]) => [id, [...names]]));
}
