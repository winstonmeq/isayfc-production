export function outletMenuMutation(action: "ASSIGN" | "UPDATE" | "REMOVE", outletId: string, itemId: string, price?: number, isAvailable?: boolean) {
  if (action === "REMOVE") return { method: "DELETE", body: { outletId, menuItemId: itemId } };
  return { method: "POST", body: { action, outletId, ...(action === "ASSIGN" ? { catalogItemId: itemId } : { menuItemId: itemId }), price, isAvailable } };
}
