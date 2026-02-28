import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();
const RECENT_ERROR_TTL_MS = 10_000;
const recentApiErrors = new Map<string, number>();

const getTrpcErrorMeta = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return null;
  const code = error.data?.code ?? "UNKNOWN";
  const status = error.data?.httpStatus ?? 0;
  const path = error.data?.path ?? "unknown";
  return { code, status, path, message: error.message };
};

const shouldSuppressApiErrorLog = (error: unknown) => {
  const meta = getTrpcErrorMeta(error);
  if (!meta) return false;

  // Auth-related failures are handled by redirect logic and can be noisy.
  if (meta.code === "UNAUTHORIZED" || meta.status === 401) return true;

  // De-duplicate repeated errors for the same path/code/status.
  const key = `${meta.path}|${meta.code}|${meta.status}|${meta.message}`;
  const now = Date.now();
  const seenAt = recentApiErrors.get(key);
  recentApiErrors.set(key, now);

  for (const [k, t] of recentApiErrors.entries()) {
    if (now - t > RECENT_ERROR_TTL_MS) recentApiErrors.delete(k);
  }

  return typeof seenAt === "number" && now - seenAt < RECENT_ERROR_TTL_MS;
};

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;
  const hasLocalSession = Boolean(
    window.localStorage.getItem("token") || window.localStorage.getItem("user")
  );
  if (hasLocalSession) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    if (shouldSuppressApiErrorLog(error)) return;
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    if (shouldSuppressApiErrorLog(error)) return;
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        const token =
          typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
        const headers = new Headers(init?.headers ?? undefined);
        if (token && !headers.has("authorization")) {
          headers.set("authorization", `Bearer ${token}`);
        }
        const response = await globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          headers,
        });
        const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
        if (contentType.includes("text/html")) {
          const preview = (await response.text()).slice(0, 200).replace(/\s+/g, " ").trim();
          throw new Error(
            `API returned HTML instead of JSON. Check server/proxy/auth routing. Response starts with: ${preview}`
          );
        }
        return response;
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
