export const RECENT_ACTIVITY_MS = 5 * 60 * 1000;
export function loginActivityStatus(row: { status: string; logoutAt?: Date | string | null; expiresAt?: Date | string | null; lastActivityAt?: Date | string | null }, now = new Date()) {
  if (row.status !== "SUCCESS") return "Failed";
  if (row.logoutAt) return "Logged out";
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= now.getTime()) return "Expired";
  const activity = row.lastActivityAt ? new Date(row.lastActivityAt).getTime() : 0;
  return activity > 0 && now.getTime() - activity >= 0 && now.getTime() - activity < RECENT_ACTIVITY_MS ? "Recently active" : "Inactive / unknown";
}
