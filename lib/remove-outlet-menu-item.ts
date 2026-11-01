import { isValidObjectId } from "mongoose";
import OutletMenuItem from "@/models/OutletMenuItem";

/** Unassign from ONE outlet; retain catalog, stock and historical references.
 * Idempotent: a repeated delete cannot recreate or reactivate a menu item.
 */
export async function removeOutletMenuItem(outletId: string, menuItemId: string) {
  if (!isValidObjectId(outletId) || !isValidObjectId(menuItemId)) return null;
  return OutletMenuItem.findOneAndUpdate(
    { _id: menuItemId, outletId },
    { $set: { isActive: false, isAvailable: false } },
    { new: true }
  );
}
