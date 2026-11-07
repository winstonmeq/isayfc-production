import { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import LoginHistory from "@/models/LoginHistory";

// No passwords, tokens, or request bodies are accepted by this logger.
export async function recordLogin(input: { userId?: string; userName: string; roleName?: string; status: "SUCCESS" | "FAILED"; reason?: string }) {
  try {
    await dbConnect();
    const now = new Date();
    const row = await LoginHistory.create({ ...input, userName: input.userName.slice(0, 160), loginAt: now,
      ...(input.status === "SUCCESS" ? { lastActivityAt: now, expiresAt: new Date(now.getTime() + 30 * 86400000) } : {}) });
    return String(row._id);
  } catch { console.error("Login history write failed"); return undefined; }
}
export async function recordLogout(id: string, userId: string) {
  if (!isValidObjectId(id) || !isValidObjectId(userId)) return;
  try {
    await dbConnect();
    await LoginHistory.updateOne({ _id: id, userId, status: "SUCCESS", logoutAt: null }, { $set: { logoutAt: new Date() } });
  } catch { console.error("Logout history write failed"); }
}
