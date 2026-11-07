/** Retired report screens resolve to their canonical, non-duplicate workspace. */
export function canonicalReportPath(path: string) {
  if (path === "/reports/profit") return "/reports/gross-sales";
  if (path === "/reports/outlet-pos" || path === "/outlet-summary") return "/pos";
  return path;
}
