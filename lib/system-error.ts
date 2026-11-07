import { randomUUID } from "node:crypto";
import { isValidObjectId } from "mongoose";
import dbConnect from "@/lib/mongodb";
import AuditLog from "@/models/AuditLog";
import { safeErrorPath } from "@/lib/system-error-policy";

// Excludes error messages, stacks, request bodies, cookies and query strings.
export async function recordSystemError(input: { source: "PAGE" | "ROOT" | "LOGIN_HISTORY_API" | "SESSION_ACTIVITY_API"; path: string; userId?: string; reference?: string; digest?: string }) {
  const reference = input.reference || randomUUID();
  const path = safeErrorPath(input.path);
  console.error("System error", { reference, source: input.source, path });
  try {
    await dbConnect();
    await AuditLog.create({ module: "SYSTEM_ERRORS", action: "ERROR", entityType: "APPLICATION", sourceChannel: "WEB",
      createdBy: input.userId && isValidObjectId(input.userId) ? input.userId : undefined,
      remarks: `${input.source} ${path} Reference: ${reference}`,
      newValue: { reference, path, source: input.source, digest: input.digest && /^[a-zA-Z0-9-]{1,80}$/.test(input.digest) ? input.digest : undefined, clientReported: input.source === "PAGE" || input.source === "ROOT" },
    });
  } catch { console.error("System error record unavailable; use server log reference", reference); }
  return reference;
}
