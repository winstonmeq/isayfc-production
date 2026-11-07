import path from "node:path";

export function productionEnvironmentIssues(env: Record<string, string | undefined>) {
  const issues: string[] = [];
  if (!env.MONGODB_URI?.trim()) issues.push("MONGODB_URI is missing.");
  const secret = env.NEXTAUTH_SECRET?.trim() ?? "";
  if (secret.length < 32 || /replace-this|change-this|example|your-secret/i.test(secret)) {
    issues.push("NEXTAUTH_SECRET must be a strong random secret of at least 32 characters.");
  }
  try {
    const url = new URL(env.NEXTAUTH_URL ?? "");
    if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) {
      issues.push("NEXTAUTH_URL must be the public HTTPS website URL.");
    }
  } catch { issues.push("NEXTAUTH_URL must be the public HTTPS website URL."); }
  if (env.BUSINESS_TEST_MODE === "1" || env.MONGODB_DB_NAME === "letson_business_test") {
    issues.push("Remove business-test environment overrides before production.");
  }
  if (!env.UPLOADS_DIR || !path.isAbsolute(env.UPLOADS_DIR)) {
    issues.push("UPLOADS_DIR must be an absolute persistent directory outside the release folder.");
  }
  if (env.SEED_ADMIN_RESET_PASSWORD === "true") issues.push("Disable SEED_ADMIN_RESET_PASSWORD before production.");
  return issues;
}
