import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ============ ROLE-BASED PROCEDURES ============

// Doctor procedure - يمكن للطبيب الوصول
export const doctorProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
    }

    if (!["doctor", "admin", "manager"].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only doctors can access this resource" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Nurse procedure - التمريض
export const nurseProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
    }

    if (!["nurse", "admin", "manager"].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only nurses can access this resource" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Technician procedure - الفني
export const technicianProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
    }

    if (!["technician", "admin", "manager"].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only technicians can access this resource" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Reception procedure - الاستقبال
export const receptionProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
    }

    if (!["reception", "admin", "manager"].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only reception staff can access this resource" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Manager procedure - المدير
export const managerProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
    }

    if (!["manager", "admin", "accountant"].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only managers can access this resource" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Admin procedure - المسؤول
export const adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
    }

    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can access this resource" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Protected procedure - أي مستخدم مسجل دخول
export const protectedProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
