import OutletModel from "@/models/Outlet";
import UserModel from "@/models/User";
import { getUserAccess } from "@/lib/require-permission";
import { canSelectPosOutlets } from "@/lib/role-permissions";
import { isValidObjectId } from "mongoose";

export async function findAuthorizedPosOutlet(userId: string, outletId: string) {
  if (!isValidObjectId(outletId)) return null;
  const user = await UserModel.findById(userId).select("role outletId").lean<{
    role?: string;
    outletId?: { toString: () => string };
  }>();
  if (!user) return null;

  const assignedOutletId = user.outletId?.toString() || "";
  const access = await getUserAccess(userId);
  if (!access?.isActive) return null;
  if (!canSelectPosOutlets(access) && outletId !== assignedOutletId) return null;

  return OutletModel.findOne({
    _id: outletId,
    isActive: true,
    status: "ACTIVE",
  }).lean();
}
