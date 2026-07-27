import { NextResponse } from "next/server";

import { readUpload } from "@/lib/upload-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ category: string; filename: string }> }
) {
  const { category, filename } = await context.params;
  const upload = await readUpload(category, filename);

  if (!upload) {
    return NextResponse.json(
      { success: false, message: "File not found." },
      { status: 404 }
    );
  }

  return new Response(new Uint8Array(upload.bytes), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": upload.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
