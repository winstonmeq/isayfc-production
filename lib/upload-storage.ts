import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const UPLOAD_CATEGORIES = ["menu", "payments"] as const;
export type UploadCategory = (typeof UPLOAD_CATEGORIES)[number];

const CONTENT_TYPES: Record<string, string> = {
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function getUploadsRoot() {
  const configured = process.env.UPLOADS_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
  }
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "var",
    "uploads"
  );
}

export function isUploadCategory(value: string): value is UploadCategory {
  return UPLOAD_CATEGORIES.includes(value as UploadCategory);
}

function normalizeExtension(extension: string) {
  const normalized = extension.toLowerCase().replace(/^\./, "");
  if (!CONTENT_TYPES[normalized]) {
    throw new Error("Unsupported upload file extension.");
  }
  return normalized;
}

export async function saveUpload(
  category: UploadCategory,
  bytes: Uint8Array,
  extension: string
) {
  const safeExtension = normalizeExtension(extension);
  const filename = `${crypto.randomUUID()}.${safeExtension}`;
  const directory = path.join(
    /* turbopackIgnore: true */ getUploadsRoot(),
    category
  );
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), bytes, { flag: "wx" });
  return `/api/uploads/${category}/${filename}`;
}

export async function readUpload(category: string, filename: string) {
  if (!isUploadCategory(category)) return null;
  if (!/^[0-9a-f-]{36}\.(gif|jpe?g|png|webp)$/i.test(filename)) return null;

  const extension = path.extname(filename).slice(1).toLowerCase();
  try {
    return {
      bytes: await readFile(
        path.join(
          /* turbopackIgnore: true */ getUploadsRoot(),
          category,
          filename
        )
      ),
      contentType: CONTENT_TYPES[extension] || "application/octet-stream",
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}
