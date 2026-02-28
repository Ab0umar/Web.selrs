import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Home, LogOut, Settings, UserCog } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: string[];
  requiredBranches?: string[];
}

function normalizePath(path: string): string {
  const raw = String(path ?? "").trim();
  if (!raw) return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const noHashOrQuery = withSlash.split("?")[0].split("#")[0];
  if (noHashOrQuery.length > 1 && noHashOrQuery.endsWith("/")) {
    return noHashOrQuery.slice(0, -1);
  }
  return noHashOrQuery;
}

export default function ProtectedRoute({
  children,
  requiredRoles,
  requiredBranches,
}: ProtectedRouteProps) {
  const { user, loading, logout } = useAuth();
  const mustChangePassword = Boolean((user as any)?.mustChangePassword);
  const forcePasswordRoute = "/force-password-change";
  const [location, setLocation] = useLocation();
  const navStackRef = useRef<string[]>([]);
  const permissionsQuery = trpc.medical.getMyPermissions.useQuery(undefined, {
    enabled: Boolean(user) && user?.role !== "admin",
    refetchOnWindowFocus: false,
  });

  const allowedPaths = useMemo(() => {
    const raw = (permissionsQuery.data ?? []) as string[];
    const normalized = raw
      .map((entry) => normalizePath(entry))
      .filter((entry) => entry.length > 0);
    return Array.from(new Set(normalized));
  }, [permissionsQuery.data]);

  const cleanPath = useMemo(() => {
    return normalizePath(location || "/");
  }, [location]);

  const isPathAllowed = useMemo(() => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (cleanPath === "/profile") return true;
    if (user.role === "reception" && cleanPath === "/examination") return true;
    if (cleanPath === forcePasswordRoute) return true;
    if (cleanPath === "/" || cleanPath === "/dashboard") return true;
    if (!allowedPaths.length) {
      return false;
    }

    return allowedPaths.some((permission) => {
      if (!permission) return false;
      if (permission === cleanPath) return true;
      if (permission !== "/" && cleanPath.startsWith(`${permission}/`)) return true;
      if (permission.includes("/:")) {
        const base = permission.split("/:")[0];
        return cleanPath === base || cleanPath.startsWith(`${base}/`);
      }
      return false;
    });
  }, [allowedPaths, cleanPath, user]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("navStack");
      navStackRef.current = raw ? JSON.parse(raw) : [];
    } catch {
      navStackRef.current = [];
    }
  }, []);

  useEffect(() => {
    const stack = navStackRef.current;
    const last = stack[stack.length - 1];
    if (last !== location) {
      stack.push(location);
      if (stack.length > 50) stack.shift();
      sessionStorage.setItem("navStack", JSON.stringify(stack));
    }
  }, [location]);

  useEffect(() => {
    if (loading) return;

    // If not authenticated, redirect to login
    if (!user) {
      setLocation("/login");
      return;
    }

    if (mustChangePassword && cleanPath !== forcePasswordRoute) {
      setLocation(forcePasswordRoute);
      return;
    }
    if (!mustChangePassword && cleanPath === forcePasswordRoute) {
      setLocation("/dashboard");
      return;
    }

    // Check role permission
    if (requiredRoles && !requiredRoles.includes(user.role)) {
      setLocation("/");
      return;
    }

    // Check branch permission
    if (
      requiredBranches &&
      user.branch !== "both" &&
      !requiredBranches.includes(user.branch)
    ) {
      setLocation("/");
      return;
    }

    if (user.role !== "admin" && permissionsQuery.isSuccess && !isPathAllowed) {
      setLocation("/");
      return;
    }
  }, [user, loading, requiredRoles, requiredBranches, setLocation, permissionsQuery.isSuccess, isPathAllowed, mustChangePassword, cleanPath]);

  if (loading || (user?.role !== "admin" && permissionsQuery.isLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 font-semibold mb-4">ليس لديك صلاحية للوصول لهذه الصفحة</p>
          <button
            onClick={() => setLocation("/")}
            className="text-blue-600 hover:underline"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    );
  }

  if (
    requiredBranches &&
    user.branch !== "both" &&
    !requiredBranches.includes(user.branch)
  ) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 font-semibold mb-4">هذه الصفحة غير متاحة لفرعك</p>
          <button
            onClick={() => setLocation("/")}
            className="text-blue-600 hover:underline"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    );
  }

  if (user.role !== "admin" && permissionsQuery.isSuccess && !isPathAllowed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 font-semibold mb-4">ليس لديك صلاحية للوصول لهذه الصفحة</p>
          <button
            onClick={() => setLocation("/")}
            className="text-blue-600 hover:underline"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    );
  }

  const handleBack = (event?: React.MouseEvent) => {
    event?.preventDefault();
    const stack = navStackRef.current;
    if (stack.length > 1) {
      stack.pop();
      const prev = stack[stack.length - 1];
      sessionStorage.setItem("navStack", JSON.stringify(stack));
      if (prev) {
        window.location.href = prev;
        return;
      }
    }
    window.location.href = "/dashboard";
  };

  const handleHome = (event?: React.MouseEvent) => {
    event?.preventDefault();
    window.location.href = "/dashboard";
  };

  const showAdminButton = cleanPath !== "/dashboard" && user?.role === "admin";

  return (
    <>
      <div className="bg-primary text-primary-foreground shadow-lg print:hidden">
        <div className="container mx-auto px-3 py-3 sm:px-4 sm:py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-right flex flex-col gap-1 items-start w-full sm:w-auto">
            <p className="text-sm font-semibold">مرحباً بك، <span dir="auto">{user?.name ?? ""}</span></p>
          </div>
          <div
            className="flex items-center justify-center gap-3 text-center w-full sm:w-auto cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={handleHome}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleHome();
              }
            }}
            aria-label="الصفحة الرئيسية"
          >
            <img src="/logo.png" alt="Logo" className="h-12 w-12 sm:h-16 sm:w-16" />
            <div className="text-right">
              <h1 className="text-lg sm:text-2xl font-bold">مركز عيون الشروق</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              onClick={handleHome}
              variant="outline"
              size="sm"
              className="gap-2 flex-1 sm:flex-none"
            >
              <Home className="h-4 w-4" />
              الصفحة الرئيسية
            </Button>
            <Button
              onClick={() => setLocation("/profile")}
              variant="outline"
              size="sm"
              className="gap-2 flex-1 sm:flex-none"
            >
              <UserCog className="h-4 w-4" />
              حسابي
            </Button>
            {showAdminButton && (
              <Button
                type="button"
                onClick={() => setLocation("/dashboard?tab=admin")}
                variant="outline"
                size="sm"
                className="gap-2 flex-1 sm:flex-none"
              >
                <Settings className="h-4 w-4" />
                الإدارة
              </Button>
            )}
            <Button
              onClick={() => logout()}
              variant="outline"
              size="sm"
              className="gap-2 flex-1 sm:flex-none"
            >
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </Button>
          </div>
        </div>
      </div>
      <div>{children}</div>
    </>
  );
}


