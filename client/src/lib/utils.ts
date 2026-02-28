import { clsx, type ClassValue } from "clsx";
import { TRPCClientError } from "@trpc/client";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateLabel(value?: string) {
  if (!value) return "لم يتم الاختيار";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

export function getTrpcErrorMessage(error: unknown, fallback = "حدث خطأ") {
  if (error instanceof TRPCClientError) {
    return error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}
