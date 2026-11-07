import { NextResponse } from "next/server";

import { readUpload } from "@/lib/upload-storage";
import { requirePermission } from "@/lib/require-permission";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ category: string; filename: string }> }
) {
  const { category, filename } = await context.params;
  if (category === "payments") {
    const { response } = await requirePermission(["payments.view", "payments.manage", "reports.payments"]);
    if (response) return response;
  }
  const upload = await readUpload(category, filename);

  if (!upload) {
    return NextResponse.json(
      { success: false, message: "File not found." },
      { status: 404 }
    );
  }

  return new Response(new Uint8Array(upload.bytes), {
    headers: {
      "Cache-Control": category === "payments" ? "private, no-store" : "public, max-age=31536000, immutable",
      "Content-Type": upload.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
