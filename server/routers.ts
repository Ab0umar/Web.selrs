import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { medicalRouter } from "./routers/medical";
import * as db from "./db";
import { authService, AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME } from "./_core/auth";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async (opts) => {
      if (!opts.ctx.user) return null;
      const mustChangePassword = await db.isPasswordChangeRequired(opts.ctx.user.id);
      return {
        ...opts.ctx.user,
        mustChangePassword,
      };
    }),
    updateProfile: protectedProcedure
      .input(
        z.object({
          email: z.union([z.string().trim().email("Invalid email"), z.literal("")]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const nextEmail = (input.email ?? "").trim() || null;
        await db.updateUser(ctx.user.id, {
          email: nextEmail as any,
        });
        await db.logAuditEvent(ctx.user.id, "UPDATE_OWN_PROFILE", "user", ctx.user.id, {
          email: nextEmail,
        });
        return { success: true } as const;
      }),
    changeUsername: protectedProcedure
      .input(
        z.object({
          username: z.string().trim().min(3, "Username must be at least 3 characters").max(64, "Username is too long"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const currentUser = await db.getUserById(ctx.user.id);
        if (!currentUser) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
        }
        const nextUsername = input.username.trim();
        if (nextUsername.toLowerCase() === String(currentUser.username || "").trim().toLowerCase()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "New username must be different" });
        }

        const existing = await db.getUserByUsername(nextUsername);
        if (existing && existing.id !== ctx.user.id) {
          throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
        }

        await db.updateUser(ctx.user.id, { username: nextUsername } as any);
        await db.logAuditEvent(ctx.user.id, "CHANGE_USERNAME", "user", ctx.user.id, {
          from: currentUser.username,
          to: nextUsername,
        });
        return { success: true } as const;
      }),
    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
          newPassword: z.string().min(6, "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.currentPassword === input.newPassword) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية",
          });
        }

        const user = await db.getUserById(ctx.user.id);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
        }

        const isCurrentPasswordValid = await authService.comparePassword(
          input.currentPassword,
          user.password || ""
        );

        if (!isCurrentPasswordValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "كلمة المرور الحالية غير صحيحة",
          });
        }

        const hashedPassword = await authService.hashPassword(input.newPassword);
        await db.updateUser(ctx.user.id, { password: hashedPassword as any });
        await db.markPasswordChanged(ctx.user.id);
        await db.logAuditEvent(ctx.user.id, "CHANGE_PASSWORD", "user", ctx.user.id);

        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(AUTH_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(LEGACY_AUTH_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  medical: medicalRouter,
});

export type AppRouter = typeof appRouter;
