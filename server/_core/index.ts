import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "./auth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerWsServer } from "./ws";
import { startMssqlSyncScheduler } from "./mssqlSyncScheduler";
import mysql from "mysql2/promise";
import { getBuildInfo } from "./buildInfo";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = parseInt(process.env.PORT || "4000")): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const pentacamExportsDir = path.resolve(process.cwd(), "Pentacam");
  registerWsServer(server);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && (err as any)?.status === 400 && "body" in err) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    next(err);
  });
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (!req.path.startsWith("/api/")) return;
      const ms = Date.now() - start;
      if (ms >= 500) {
        console.warn(`[slow-api] ${req.method} ${req.path} -> ${res.statusCode} in ${ms}ms`);
      } else if (process.env.NODE_ENV !== "production") {
        console.log(`[api] ${req.method} ${req.path} -> ${res.statusCode} in ${ms}ms`);
      }
    });
    next();
  });
  app.get("/healthz", async (_req, res) => {
    const build = await getBuildInfo().catch(() => ({ version: "unknown", buildTime: "unknown", commit: "unknown" }));
    const payload: {
      ok: boolean;
      env: string;
      dbConnected: boolean;
      version: string;
      buildTime: string;
      commit: string;
      patientsCount?: number;
      dbError?: string;
    } = {
      ok: true,
      env: process.env.NODE_ENV || "development",
      dbConnected: false,
      version: build.version,
      buildTime: build.buildTime,
      commit: build.commit,
    };
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      payload.dbError = "DATABASE_URL is missing";
      res.status(200).json(payload);
      return;
    }
    let conn: mysql.Connection | null = null;
    try {
      conn = await mysql.createConnection(databaseUrl);
      const [rows] = await conn.query("SELECT COUNT(*) AS c FROM patients");
      const first = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
      payload.dbConnected = true;
      payload.patientsCount = Number(first?.c ?? 0);
    } catch (error: any) {
      payload.dbConnected = false;
      payload.dbError = String(error?.code || error?.message || "DB ping failed");
    } finally {
      if (conn) await conn.end();
    }
    res.status(200).json(payload);
  });
  // Local auth routes
  registerAuthRoutes(app);

  // Local Pentacam exports: list files and serve image assets.
  app.get("/api/pentacam/exports", async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 500);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(10000, limitRaw)) : 500;
      const dirEntries = await readdir(pentacamExportsDir, { withFileTypes: true }).catch(() => []);
      const files: Array<{ name: string; size: number; mtime: string; url: string }> = [];

      for (const entry of dirEntries) {
        if (!entry.isFile()) continue;
        const name = String(entry.name ?? "").trim();
        if (!/\.(jpg|jpeg|png|webp)$/i.test(name)) continue;
        const fullPath = path.join(pentacamExportsDir, name);
        const info = await stat(fullPath).catch(() => null);
        if (!info?.isFile()) continue;
        files.push({
          name,
          size: Number(info.size ?? 0),
          mtime: new Date(info.mtime).toISOString(),
          url: `/pentacam-exports/${encodeURIComponent(name)}`,
        });
      }

      files.sort((a, b) => Date.parse(b.mtime) - Date.parse(a.mtime));
      const sliced = files.slice(0, limit);
      res.status(200).json({ ok: true, count: sliced.length, files: sliced });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        count: 0,
        files: [],
        error: String(error?.message ?? "Failed to list Pentacam exports"),
      });
    }
  });
  app.use("/pentacam-exports", express.static(pentacamExportsDir, { maxAge: "1h", fallthrough: true }));

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "4000");
  // Bind to all interfaces by default to allow LAN/mobile access.
  const host = process.env.HOST || "0.0.0.0";
  const branchName = process.env.BRANCH || "clinic";
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`[${branchName}] Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, host, () => {
    console.log(`[${branchName}] Server running on http://${host}:${port}/`);
  });
  startMssqlSyncScheduler();
}

startServer().catch(console.error);
