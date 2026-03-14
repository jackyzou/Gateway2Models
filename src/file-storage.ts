import { mkdir, readFile, writeFile, readdir, stat, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";
const STORAGE_DIR = join(HOME, ".g2m", "storage");

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

// ── Types ────────────────────────────────────────────────────────────

export interface StoredFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  category: "image" | "audio" | "video" | "document" | "other";
  /** Source: which endpoint generated this */
  source: string;
  /** Associated session ID */
  sessionId?: string;
  /** Prompt that generated this content */
  prompt?: string;
  createdAt: number;
  url: string;
}

// ── MIME type mapping ────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

function categoryFromMime(mime: string): StoredFile["category"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("text/") || mime === "application/pdf") return "document";
  return "other";
}

// ── Storage Operations ───────────────────────────────────────────────

/** Store a file (from base64 data) */
export async function storeFile(opts: {
  data: string;
  filename: string;
  mimeType?: string;
  source: string;
  sessionId?: string;
  prompt?: string;
}): Promise<StoredFile> {
  const id = randomUUID().slice(0, 16);
  const ext = extname(opts.filename) || ".bin";
  const mimeType = opts.mimeType ?? MIME_MAP[ext.toLowerCase()] ?? "application/octet-stream";
  const category = categoryFromMime(mimeType);

  // Store in category subdirectory
  const dir = join(STORAGE_DIR, category);
  await ensureDir(dir);

  const storedFilename = `${id}${ext}`;
  const filePath = join(dir, storedFilename);

  // Decode base64 and write
  const buffer = Buffer.from(opts.data, "base64");
  await writeFile(filePath, buffer);

  const file: StoredFile = {
    id,
    filename: opts.filename,
    mimeType,
    size: buffer.length,
    category,
    source: opts.source,
    sessionId: opts.sessionId,
    prompt: opts.prompt,
    createdAt: Date.now(),
    url: `/v1/storage/${id}`,
  };

  // Save metadata
  await writeFile(join(dir, `${id}.meta.json`), JSON.stringify(file, null, 2), "utf-8");

  return file;
}

/** Store a file from raw buffer */
export async function storeBuffer(opts: {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
  source: string;
  sessionId?: string;
  prompt?: string;
}): Promise<StoredFile> {
  return storeFile({
    data: opts.buffer.toString("base64"),
    filename: opts.filename,
    mimeType: opts.mimeType,
    source: opts.source,
    sessionId: opts.sessionId,
    prompt: opts.prompt,
  });
}

/** Get file metadata by ID */
export async function getFileMeta(id: string): Promise<StoredFile | null> {
  for (const category of ["image", "audio", "video", "document", "other"]) {
    try {
      const metaPath = join(STORAGE_DIR, category, `${id}.meta.json`);
      const raw = await readFile(metaPath, "utf-8");
      return JSON.parse(raw) as StoredFile;
    } catch { /* not in this category */ }
  }
  return null;
}

/** Get file data by ID */
export async function getFileData(id: string): Promise<{ buffer: Buffer; meta: StoredFile } | null> {
  const meta = await getFileMeta(id);
  if (!meta) return null;

  try {
    // Find the actual file
    const dir = join(STORAGE_DIR, meta.category);
    const files = await readdir(dir);
    const match = files.find((f) => f.startsWith(id) && !f.endsWith(".meta.json"));
    if (!match) return null;

    const buffer = await readFile(join(dir, match));
    return { buffer, meta };
  } catch {
    return null;
  }
}

/** List stored files */
export async function listStoredFiles(opts?: {
  category?: StoredFile["category"];
  sessionId?: string;
  limit?: number;
}): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  const categories = opts?.category ? [opts.category] : ["image", "audio", "video", "document", "other"];

  for (const category of categories) {
    try {
      const dir = join(STORAGE_DIR, category);
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (!entry.endsWith(".meta.json")) continue;
        try {
          const raw = await readFile(join(dir, entry), "utf-8");
          const meta = JSON.parse(raw) as StoredFile;
          if (opts?.sessionId && meta.sessionId !== opts.sessionId) continue;
          files.push(meta);
        } catch { /* skip corrupt */ }
      }
    } catch { /* category dir doesn't exist */ }
  }

  files.sort((a, b) => b.createdAt - a.createdAt);
  return opts?.limit ? files.slice(0, opts.limit) : files;
}

/** Delete a stored file */
export async function deleteStoredFile(id: string): Promise<boolean> {
  const meta = await getFileMeta(id);
  if (!meta) return false;

  const dir = join(STORAGE_DIR, meta.category);
  try {
    const files = await readdir(dir);
    for (const f of files) {
      if (f.startsWith(id)) {
        await unlink(join(dir, f));
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Get storage stats */
export async function getStorageStats(): Promise<{
  totalFiles: number;
  totalSize: number;
  byCategory: Record<string, { count: number; size: number }>;
}> {
  const byCategory: Record<string, { count: number; size: number }> = {};
  let totalFiles = 0;
  let totalSize = 0;

  for (const category of ["image", "audio", "video", "document", "other"]) {
    let count = 0;
    let size = 0;

    try {
      const dir = join(STORAGE_DIR, category);
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (entry.endsWith(".meta.json")) continue;
        try {
          const s = await stat(join(dir, entry));
          count++;
          size += s.size;
        } catch { /* skip */ }
      }
    } catch { /* dir doesn't exist */ }

    byCategory[category] = { count, size };
    totalFiles += count;
    totalSize += size;
  }

  return { totalFiles, totalSize, byCategory };
}
