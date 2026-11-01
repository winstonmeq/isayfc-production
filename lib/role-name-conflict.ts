export function roleNameConflictMessage(inactive = false) {
  return inactive
    ? "This role name belongs to a disabled role. Use a different name; disabled roles retain their identity and assigned users."
    : "Role name already exists. Edit the existing role or use a different name.";
}
export function isRoleDuplicateKey(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
