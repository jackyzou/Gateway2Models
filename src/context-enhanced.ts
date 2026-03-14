import { watch, type FSWatcher } from "node:fs";
import { exec } from "node:child_process";
import { readFile, readdir, stat, access } from "node:fs/promises";
import { join, resolve, normalize, extname } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// ── File Watcher ─────────────────────────────────────────────────────

const watchers = new Map<string, FSWatcher>();
const changeCallbacks = new Map<string, ((path: string) => void)[]>();

/** Watch a directory for changes. Calls callback with changed file path. */
export function watchDirectory(
  dirPath: string,
  callback: (changedPath: string) => void,
): () => void {
  const resolved = normalize(resolve(dirPath));

  // Register callback
  if (!changeCallbacks.has(resolved)) {
    changeCallbacks.set(resolved, []);
  }
  changeCallbacks.get(resolved)!.push(callback);

  // Start watcher if not already running
  if (!watchers.has(resolved)) {
    try {
      const watcher = watch(resolved, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const fullPath = join(resolved, filename);
        const cbs = changeCallbacks.get(resolved) ?? [];
        for (const cb of cbs) cb(fullPath);
      });
      watchers.set(resolved, watcher);
    } catch {
      // Directory doesn't exist or not watchable
    }
  }

  // Return unsubscribe function
  return () => {
    const cbs = changeCallbacks.get(resolved);
    if (cbs) {
      const idx = cbs.indexOf(callback);
      if (idx >= 0) cbs.splice(idx, 1);
      if (cbs.length === 0) {
        watchers.get(resolved)?.close();
        watchers.delete(resolved);
        changeCallbacks.delete(resolved);
      }
    }
  };
}

export function stopAllWatchers(): void {
  for (const [, watcher] of watchers) watcher.close();
  watchers.clear();
  changeCallbacks.clear();
}

// ── Git Diff Context ─────────────────────────────────────────────────

export interface GitDiff {
  summary: string;
  files: { path: string; status: string; additions: number; deletions: number }[];
  diff: string;
}

/** Get recent git changes for a directory */
export async function getGitDiff(
  dirPath: string,
  options: { staged?: boolean; commits?: number } = {},
): Promise<GitDiff | null> {
  const resolved = normalize(resolve(dirPath));

  try {
    // Check if it's a git repo
    await access(join(resolved, ".git"));
  } catch {
    // Try parent directories
    try {
      const { stdout } = await execAsync("git rev-parse --show-toplevel", { cwd: resolved });
      if (!stdout.trim()) return null;
    } catch {
      return null;
    }
  }

  try {
    let diffCmd: string;
    if (options.staged) {
      diffCmd = "git diff --cached --stat --no-color";
    } else if (options.commits) {
      diffCmd = `git diff HEAD~${options.commits} --stat --no-color`;
    } else {
      // Uncommitted changes (staged + unstaged)
      diffCmd = "git diff HEAD --stat --no-color";
    }

    const { stdout: statOutput } = await execAsync(diffCmd, { cwd: resolved, timeout: 10000 });

    // Get the actual diff (limited to 50KB)
    const diffFullCmd = diffCmd.replace("--stat", "").trim();
    const { stdout: diffOutput } = await execAsync(diffFullCmd, {
      cwd: resolved,
      timeout: 10000,
      maxBuffer: 50 * 1024,
    });

    // Parse stat output into file list
    const files: GitDiff["files"] = [];
    for (const line of statOutput.split("\n")) {
      const match = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s+(\++)?(-+)?/);
      if (match) {
        files.push({
          path: match[1].trim(),
          status: "modified",
          additions: (match[3] ?? "").length,
          deletions: (match[4] ?? "").length,
        });
      }
    }

    // Get recent commit messages
    let summary = "";
    try {
      const { stdout: logOutput } = await execAsync(
        `git log --oneline -${options.commits ?? 3} --no-color`,
        { cwd: resolved, timeout: 5000 },
      );
      summary = logOutput.trim();
    } catch { /* no commits yet */ }

    return {
      summary,
      files,
      diff: diffOutput.slice(0, 50000),
    };
  } catch {
    return null;
  }
}

// ── Project Discovery ────────────────────────────────────────────────

export interface ProjectInfo {
  type: string;
  name?: string;
  description?: string;
  techStack: string[];
  entryFiles: string[];
  configFiles: string[];
  hasTests: boolean;
  hasDocker: boolean;
  hasCi: boolean;
}

const PROJECT_MARKERS: { file: string; type: string; tech: string }[] = [
  { file: "package.json", type: "nodejs", tech: "Node.js" },
  { file: "tsconfig.json", type: "typescript", tech: "TypeScript" },
  { file: "pyproject.toml", type: "python", tech: "Python" },
  { file: "setup.py", type: "python", tech: "Python" },
  { file: "requirements.txt", type: "python", tech: "Python" },
  { file: "Cargo.toml", type: "rust", tech: "Rust" },
  { file: "go.mod", type: "go", tech: "Go" },
  { file: "pom.xml", type: "java", tech: "Java" },
  { file: "build.gradle", type: "java", tech: "Java/Kotlin" },
  { file: "Gemfile", type: "ruby", tech: "Ruby" },
  { file: "composer.json", type: "php", tech: "PHP" },
  { file: "pubspec.yaml", type: "dart", tech: "Dart/Flutter" },
  { file: "Package.swift", type: "swift", tech: "Swift" },
  { file: "mix.exs", type: "elixir", tech: "Elixir" },
];

const FRAMEWORK_MARKERS: { file: string; tech: string }[] = [
  { file: "next.config.js", tech: "Next.js" },
  { file: "next.config.mjs", tech: "Next.js" },
  { file: "next.config.ts", tech: "Next.js" },
  { file: "nuxt.config.ts", tech: "Nuxt" },
  { file: "vite.config.ts", tech: "Vite" },
  { file: "angular.json", tech: "Angular" },
  { file: "svelte.config.js", tech: "SvelteKit" },
  { file: "astro.config.mjs", tech: "Astro" },
  { file: "tailwind.config.js", tech: "Tailwind CSS" },
  { file: "tailwind.config.ts", tech: "Tailwind CSS" },
  { file: "prisma/schema.prisma", tech: "Prisma" },
  { file: "drizzle.config.ts", tech: "Drizzle ORM" },
  { file: "docker-compose.yml", tech: "Docker" },
  { file: "Dockerfile", tech: "Docker" },
  { file: ".github/workflows", tech: "GitHub Actions" },
];

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

/** Auto-detect project type and tech stack from directory structure */
export async function discoverProject(dirPath: string): Promise<ProjectInfo> {
  const resolved = normalize(resolve(dirPath));
  const techStack: string[] = [];
  const entryFiles: string[] = [];
  const configFiles: string[] = [];
  let type = "unknown";
  let name: string | undefined;
  let description: string | undefined;

  // Check project markers
  for (const marker of PROJECT_MARKERS) {
    const fullPath = join(resolved, marker.file);
    if (await fileExists(fullPath)) {
      type = marker.type;
      techStack.push(marker.tech);
      configFiles.push(marker.file);

      // Try to extract name/description
      if (marker.file === "package.json") {
        try {
          const pkg = JSON.parse(await readFile(fullPath, "utf-8"));
          name = pkg.name;
          description = pkg.description;
        } catch { /* skip */ }
      }
      if (marker.file === "pyproject.toml") {
        try {
          const content = await readFile(fullPath, "utf-8");
          const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
          if (nameMatch) name = nameMatch[1];
        } catch { /* skip */ }
      }
      if (marker.file === "Cargo.toml") {
        try {
          const content = await readFile(fullPath, "utf-8");
          const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
          if (nameMatch) name = nameMatch[1];
        } catch { /* skip */ }
      }
    }
  }

  // Check framework markers
  for (const marker of FRAMEWORK_MARKERS) {
    if (await fileExists(join(resolved, marker.file))) {
      techStack.push(marker.tech);
      configFiles.push(marker.file);
    }
  }

  // Check for common entry files
  const commonEntries = [
    "src/index.ts", "src/index.js", "src/main.ts", "src/main.py",
    "src/app.ts", "src/server.ts", "app.py", "main.py", "main.go",
    "src/main.rs", "src/lib.rs", "index.ts", "index.js",
  ];
  for (const entry of commonEntries) {
    if (await fileExists(join(resolved, entry))) {
      entryFiles.push(entry);
    }
  }

  // Check for tests, docker, CI
  const hasTests = await fileExists(join(resolved, "tests"))
    || await fileExists(join(resolved, "test"))
    || await fileExists(join(resolved, "__tests__"))
    || await fileExists(join(resolved, "spec"));
  const hasDocker = await fileExists(join(resolved, "Dockerfile"))
    || await fileExists(join(resolved, "docker-compose.yml"));
  const hasCi = await fileExists(join(resolved, ".github", "workflows"))
    || await fileExists(join(resolved, ".gitlab-ci.yml"))
    || await fileExists(join(resolved, "Jenkinsfile"));

  // Deduplicate tech stack
  const uniqueTech = [...new Set(techStack)];

  return {
    type,
    name,
    description,
    techStack: uniqueTech,
    entryFiles,
    configFiles,
    hasTests,
    hasDocker,
    hasCi,
  };
}
