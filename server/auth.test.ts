import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { authService } from "./_core/auth";
import * as db from "./db";

describe("Auth Service", () => {
  describe("Password hashing", () => {
    it("should hash password correctly", async () => {
      const password = "test123";
      const hash = await authService.hashPassword(password);
      
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should compare password correctly", async () => {
      const password = "test123";
      const hash = await authService.hashPassword(password);
      
      const isValid = await authService.comparePassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should reject wrong password", async () => {
      const password = "test123";
      const hash = await authService.hashPassword(password);
      
      const isValid = await authService.comparePassword("wrongpassword", hash);
      expect(isValid).toBe(false);
    });
  });

  describe("JWT Token", () => {
    it("should create valid JWT token", () => {
      const token = authService.generateToken({
        id: 1,
        username: "testuser",
        name: "Test User",
        role: "admin",
        branch: "examinations",
        password: "hashed",
        email: "test@example.com",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: null,
      });

      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
    });

    it("should verify valid JWT token", () => {
      const token = authService.generateToken({
        id: 1,
        username: "testuser",
        name: "Test User",
        role: "admin",
        branch: "examinations",
        password: "hashed",
        email: "test@example.com",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: null,
      });

      const payload = authService.verifyToken(token);
      expect(payload).toBeTruthy();
      expect(payload.username).toBe("testuser");
      expect(payload.role).toBe("admin");
    });

    it("should reject invalid JWT token", () => {
      const payload = authService.verifyToken("invalid.token.here");
      expect(payload).toBeNull();
    });
  });
});
