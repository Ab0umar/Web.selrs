import type { Express, Request, Response } from "express";
import * as db from "../db";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { parse as parseCookieHeader } from "cookie";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { ENV } from "./env";

export const AUTH_COOKIE_NAME = COOKIE_NAME;
export const LEGACY_AUTH_COOKIE_NAME = "authToken";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export type SessionPayload = {
  userId: number;
  username: string;
  role: string;
  branch: string;
};

class LocalAuthService {


  /**
   * Hash password using bcryptjs
   */
  async hashPassword(password: string): Promise<string> {
    return bcryptjs.hash(password, 10);
  }

  /**
   * Compare password with hash
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcryptjs.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  generateToken(user: User): string {
    const secret = ENV.JWT_SECRET || "your-secret-key";
    return jwt.sign(
      { userId: user.id, username: user.username, role: user.role, branch: user.branch },
      secret,
      { expiresIn: "24h" }
    );
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): any {
    try {
      const secret = ENV.JWT_SECRET || "your-secret-key";
      return jwt.verify(token, secret);
    } catch (error) {
      return null;
    }
  }

  /**
   * Create session token
   */
  async createSessionToken(
    userId: number,
    username: string,
    role: string,
    branch: string,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const secret = ENV.JWT_SECRET || "your-secret-key";
    return jwt.sign(
      { userId, username, role, branch },
      secret,
      { expiresIn: "24h" }
    );
  }

  /**
   * Verify session token
   */
  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<SessionPayload | null> {
    if (!cookieValue) {
      return null;
    }

    try {
      const secret = ENV.JWT_SECRET || "your-secret-key";
      const payload = jwt.verify(cookieValue, secret) as SessionPayload;
      return payload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Authenticate request
   */
  async authenticateRequest(req: Request): Promise<User | null> {
    const cookies = parseCookieHeader(req.headers.cookie || "");
    const primaryCookie = cookies[AUTH_COOKIE_NAME];
    const legacyCookie = cookies[LEGACY_AUTH_COOKIE_NAME];
    const authHeader = req.headers.authorization;
    const bearerToken =
      typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : null;
    const tokenCandidates = [primaryCookie, legacyCookie, bearerToken].filter(
      (token): token is string => Boolean(token)
    );

    let session: SessionPayload | null = null;
    for (const token of tokenCandidates) {
      session = await this.verifySession(token);
      if (session) break;
    }

    if (!session) {
      return null;
    }

    const user = await db.getUserById(session.userId);

    if (!user || !user.isActive) {
      return null;
    }

    return user;
  }


}

export const authService = new LocalAuthService();

/**
 * Register local auth routes
 */
export function registerAuthRoutes(app: Express) {
  // Login route
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ error: "Username and password are required" });
        return;
      }

      // Get user by username
      const user = await db.getUserByUsername(username);

      if (!user) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      // Compare password
      const isValidPassword = await authService.comparePassword(
        password,
        user.password || ""
      );

      if (!isValidPassword) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      // Create session token
      const sessionToken = await authService.createSessionToken(
        user.id,
        user.username,
        user.role,
        user.branch || "examinations"
      );

      await db.updateUserLastSignedIn(user.id);
      const mustChangePassword = await db.isPasswordChangeRequired(user.id);

      const forwardedProtoHeader = req.headers["x-forwarded-proto"];
      const forwardedProto = Array.isArray(forwardedProtoHeader)
        ? forwardedProtoHeader[0]
        : forwardedProtoHeader;
      const isHttps =
        req.secure ||
        String(forwardedProto || "")
          .toLowerCase()
          .includes("https");

      res.cookie(AUTH_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "strict",
        maxAge: ONE_YEAR_MS,
      });
      // Backward compatibility for clients still sending the old cookie name.
      res.cookie(LEGACY_AUTH_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "strict",
        maxAge: ONE_YEAR_MS,
      });

      res.json({
        success: true,
        token: sessionToken,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          branch: user.branch,
          mustChangePassword,
        },
      });
    } catch (error) {
      console.error("[Auth] Login failed", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Logout route
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    res.clearCookie(AUTH_COOKIE_NAME);
    res.clearCookie(LEGACY_AUTH_COOKIE_NAME);
    res.json({ success: true });
  });

  // Check auth status
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await authService.authenticateRequest(req);
      if (!user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          branch: user.branch,
          mustChangePassword: await db.isPasswordChangeRequired(user.id),
        },
      });
    } catch (error) {
      res.status(401).json({ error: "Not authenticated" });
    }
  });
}
