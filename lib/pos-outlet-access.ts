import OutletModel from "@/models/Outlet";
import UserModel from "@/models/User";

export async function findAuthorizedPosOutlet(userId: string, outletId: string) {
  const user = await UserModel.findById(userId).select("role outletId").lean<{
    role?: string;
    outletId?: { toString: () => string };
  }>();
  if (!user) return null;

  const assignedOutletId = user.outletId?.toString() || "";
  const isAdmin = String(user.role || "").toUpperCase() === "ADMIN";
  if (!isAdmin && outletId !== assignedOutletId) return null;

  return OutletModel.findOne({
    _id: outletId,
    isActive: true,
    status: "ACTIVE",
  }).lean();
}
