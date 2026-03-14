import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname, resolve, normalize } from "node:path";
import { z } from "zod";

// ── Request schemas ──────────────────────────────────────────────────

export const ReadFileRequestSchema = z.object({
  path: z.string().min(1),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
});

export const ListDirRequestSchema = z.object({
  path: z.string().min(1),
  recursive: z.boolean().default(false),
  maxDepth: z.number().int().min(1).max(10).default(3),
  includeHidden: z.boolean().default(false),
});

export const GlobFilesRequestSchema = z.object({
  directory: z.string().min(1),
  extensions: z.array(z.string()).optional(),
  maxFiles: z.number().int().min(1).max(200).default(50),
  maxDepth: z.number().int().min(1).max(10).default(5),
});

export const LoadContextRequestSchema = z.object({
  paths: z.array(z.string()).min(1).max(20),
  maxTotalSize: z.number().int().max(2_000_000).default(500_000),
});

// ── Response types ───────────────────────────────────────────────────

export interface FileContent {
  path: string;
  content: string;
  lines: number;
  size: number;
}

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

// ── Text file extensions ─────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".pyi",
  ".rs", ".go", ".java", ".kt", ".scala", ".c", ".cpp", ".h", ".hpp", ".cs",
  ".rb", ".php", ".swift", ".dart", ".lua", ".r", ".jl",
  ".html", ".css", ".scss", ".less", ".vue", ".svelte",
  ".json", ".yaml", ".yml", ".toml", ".xml", ".csv",
  ".md", ".mdx", ".txt", ".rst", ".tex",
  ".sh", ".bash", ".zsh", ".fish", ".ps1", ".psm1", ".bat", ".cmd",
  ".sql", ".graphql", ".gql", ".proto",
  ".dockerfile", ".dockerignore", ".gitignore", ".env.example",
  ".tf", ".hcl", ".bicep",
  ".lock", ".config", ".cfg", ".ini", ".properties",
]);

function isTextFile(filepath: string): boolean {
  const ext = extname(filepath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Common dotfiles
  const basename = filepath.split(/[\\/]/).pop() ?? "";
  return [
    "Makefile", "Dockerfile", "Vagrantfile", "Gemfile", "Rakefile",
    "Procfile", "Brewfile", ".gitignore", ".env", ".editorconfig",
    "CODEOWNERS", "LICENSE", "CHANGELOG",
  ].some((name) => basename === name || basename.startsWith(name));
}

// ── Core functions ───────────────────────────────────────────────────

/** Resolve and normalize a path, preventing directory traversal attacks */
function safePath(input: string): string {
  return normalize(resolve(input));
}

/** Read a single file, optionally with line range */
export async function readFileContent(
  filepath: string,
  startLine?: number,
  endLine?: number,
): Promise<FileContent> {
  const resolved = safePath(filepath);
  const fileStat = await stat(resolved);

  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${resolved}`);
  }
  if (fileStat.size > 2_000_000) {
    throw new Error(`File too large (${fileStat.size} bytes, max 2MB): ${resolved}`);
  }

  const raw = await readFile(resolved, "utf-8");
  const allLines = raw.split("\n");

  let content: string;
  if (startLine || endLine) {
    const start = (startLine ?? 1) - 1;
    const end = endLine ?? allLines.length;
    content = allLines.slice(start, end).join("\n");
  } else {
    content = raw;
  }

  return {
    path: resolved,
    content,
    lines: allLines.length,
    size: fileStat.size,
  };
}

/** List directory contents */
export async function listDirectory(
  dirPath: string,
  recursive = false,
  maxDepth = 3,
  includeHidden = false,
  _currentDepth = 0,
): Promise<DirEntry[]> {
  const resolved = safePath(dirPath);
  const entries: DirEntry[] = [];

  const items = await readdir(resolved, { withFileTypes: true });

  for (const item of items) {
    if (!includeHidden && item.name.startsWith(".")) continue;
    if (item.name === "node_modules" || item.name === ".git") continue;

    const fullPath = join(resolved, item.name);
    const type = item.isDirectory() ? "directory" : "file";

    let size: number | undefined;
    if (item.isFile()) {
      try {
        const s = await stat(fullPath);
        size = s.size;
      } catch { /* ignore */ }
    }

    entries.push({ name: item.name, path: fullPath, type, size });

    if (recursive && item.isDirectory() && _currentDepth < maxDepth - 1) {
      const subEntries = await listDirectory(
        fullPath, true, maxDepth, includeHidden, _currentDepth + 1,
      );
      entries.push(...subEntries);
    }
  }

  return entries;
}

/** Find files matching extension filters */
export async function globFiles(
  directory: string,
  extensions?: string[],
  maxFiles = 50,
  maxDepth = 5,
): Promise<string[]> {
  const resolved = safePath(directory);
  const found: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || found.length >= maxFiles) return;
    const items = await readdir(dir, { withFileTypes: true });

    for (const item of items) {
      if (found.length >= maxFiles) return;
      if (item.name.startsWith(".") || item.name === "node_modules") continue;

      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        await walk(fullPath, depth + 1);
      } else if (item.isFile()) {
        if (!extensions || extensions.some((ext) => item.name.endsWith(ext))) {
          found.push(fullPath);
        }
      }
    }
  }

  await walk(resolved, 0);
  return found;
}

/** Load multiple file contents with total size budget */
export async function loadContext(
  paths: string[],
  maxTotalSize = 500_000,
): Promise<FileContent[]> {
  const results: FileContent[] = [];
  let totalSize = 0;

  for (const p of paths) {
    try {
      const resolved = safePath(p);
      const fileStat = await stat(resolved);

      if (fileStat.isDirectory()) {
        // Load text files from directory
        const files = await globFiles(resolved, undefined, 30);
        for (const f of files) {
          if (totalSize >= maxTotalSize) break;
          if (!isTextFile(f)) continue;
          try {
            const fc = await readFileContent(f);
            if (totalSize + fc.size > maxTotalSize) continue;
            totalSize += fc.size;
            results.push(fc);
          } catch { /* skip unreadable files */ }
        }
      } else {
        const fc = await readFileContent(resolved);
        if (totalSize + fc.size <= maxTotalSize) {
          totalSize += fc.size;
          results.push(fc);
        }
      }
    } catch (err) {
      results.push({
        path: p,
        content: `[Error: ${err instanceof Error ? err.message : String(err)}]`,
        lines: 0,
        size: 0,
      });
    }
  }

  return results;
}
