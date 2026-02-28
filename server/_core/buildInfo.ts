import fs from "node:fs/promises";
import path from "node:path";

type BuildInfo = {
  version: string;
  buildTime: string;
  commit: string;
};

let cache: BuildInfo | null = null;
let cacheAt = 0;

export async function getBuildInfo(): Promise<BuildInfo> {
  const now = Date.now();
  if (cache && now - cacheAt < 10_000) return cache;

  let version = String(process.env.APP_VERSION ?? "").trim();
  if (!version) {
    try {
      const pkgRaw = await fs.readFile(path.resolve(process.cwd(), "package.json"), "utf8");
      const pkg = JSON.parse(pkgRaw) as { version?: string };
      version = String(pkg?.version ?? "").trim();
    } catch {
      // keep unknown fallback
    }
  }

  const buildTime = String(process.env.BUILD_TIME ?? "").trim() || "unknown";
  const commit =
    String(process.env.GIT_COMMIT ?? "").trim() ||
    String(process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim() ||
    "unknown";

  cache = {
    version: version || "unknown",
    buildTime,
    commit,
  };
  cacheAt = now;
  return cache;
}

