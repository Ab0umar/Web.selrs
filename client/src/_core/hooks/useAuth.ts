import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();
  const getPreferredStorage = useCallback(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("remember_me") === "0"
      ? window.sessionStorage
      : window.localStorage;
  }, []);
  const storedUser = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw =
        window.localStorage.getItem("user") ?? window.sessionStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async (options?: { redirectToLogin?: boolean }) => {
    const redirectToLogin = options?.redirectToLogin ?? true;
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("token");
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      if (redirectToLogin && typeof window !== "undefined") {
        window.location.href = getLoginUrl();
      }
    }
  }, [logoutMutation, utils]);

  const state = useMemo(
    () => ({
      user: meQuery.data ?? storedUser ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data ?? storedUser),
    }),
    [
      meQuery.data,
      meQuery.error,
      meQuery.isLoading,
      logoutMutation.error,
      logoutMutation.isPending,
      storedUser,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (meQuery.data) {
      const serializedUser = JSON.stringify(meQuery.data);
      const preferredStorage = getPreferredStorage();
      const secondaryStorage =
        preferredStorage === window.localStorage ? window.sessionStorage : window.localStorage;
      window.localStorage.setItem("manus-runtime-user-info", serializedUser);
      preferredStorage?.setItem("user", serializedUser);
      secondaryStorage.removeItem("user");
    }
  }, [getPreferredStorage, meQuery.data]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
