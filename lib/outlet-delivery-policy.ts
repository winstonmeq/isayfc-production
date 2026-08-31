export function canCreateManualOutletDelivery(input: {
  role?: string | null;
  roleName?: string | null;
}) {
  return [input.role, input.roleName]
    .map((value) => String(value || "").trim().toUpperCase())
    .includes("ADMIN");
}
