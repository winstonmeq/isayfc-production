export function safeErrorPath(value: unknown) {
  if (typeof value !== "string") return "/unknown";
  const path = value.split(/[?#]/, 1)[0];
  return /^\/[a-zA-Z0-9/_-]{0,180}$/.test(path) ? path : "/unknown";
}
export function validErrorReference(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value);
}
