import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { getTrpcErrorMessage } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { LayoutDashboard, KeyRound, LogOut, PanelLeft, UserCog, Users } from "lucide-react";
import { type ReactNode, CSSProperties, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const menuItems = [
  { icon: LayoutDashboard, label: "Page 1", path: "/dashboard?tab=admin" },
  { icon: Users, label: "Page 2", path: "/some-path" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [, setLocation] = useLocation();
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign In To Continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access To This Dashboard Requires Authentication. Continue To Launch The Login Flow.
            </p>
          </div>
          <Button
            onClick={() => {
              setLocation(getLoginUrl(), { replace: true });
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const mustForcePasswordChange = Boolean((user as any)?.mustChangePassword);
  const utils = trpc.useUtils();
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [accountUsername, setAccountUsername] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();
  const changeUsernameMutation = trpc.auth.changeUsername.useMutation({
    onSuccess: async () => {
      toast.success("Username Updated");
      setIsAccountDialogOpen(false);
      await utils.auth.me.invalidate();
    },
  });
  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: async () => {
      toast.success("Profile Updated");
      await utils.auth.me.invalidate();
    },
  });
  const changePasswordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      toast.success("تم تغيير كلمة المرور بنجاح");
      setIsPasswordDialogOpen(false);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      await utils.auth.me.invalidate();
    },
  });

  const handleSignOut = async () => {
    await logout();
  };

  const handleChangePassword = async () => {
    const currentPassword = passwordForm.currentPassword.trim();
    const newPassword = passwordForm.newPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("يرجى ملء جميع حقول كلمة المرور");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("تأكيد كلمة المرور الجديدة غير متطابق");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية");
      return;
    }

    try {
      await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
      });
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "فشل تغيير كلمة المرور"));
    }
  };

  const handleUpdateUsername = async () => {
    const nextUsername = accountUsername.trim();
    if (!nextUsername) {
      toast.error("Username Is Required");
      return false;
    }
    if (nextUsername.length < 3) {
      toast.error("Username Must Be At Least 3 Characters");
      return false;
    }
    if (nextUsername === String((user as any)?.username ?? "").trim()) {
      return true;
    }

    try {
      await changeUsernameMutation.mutateAsync({ username: nextUsername });
      return true;
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed To Update Username"));
      return false;
    }
  };

  const handleUpdateProfile = async () => {
    const nextEmail = accountEmail.trim();
    try {
      const currentEmail = String((user as any)?.email ?? "").trim();
      if (nextEmail === currentEmail) {
        return true;
      }
      await updateProfileMutation.mutateAsync({
        email: nextEmail,
      });
      return true;
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed To Update Profile"));
      return false;
    }
  };

  useEffect(() => {
    setAccountUsername(String((user as any)?.username ?? ""));
    setAccountName(String((user as any)?.name ?? ""));
    setAccountEmail(String((user as any)?.email ?? ""));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (mustForcePasswordChange) {
      setIsPasswordDialogOpen(true);
    }
  }, [mustForcePasswordChange, user]);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate">
                    Navigation
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => {
                    if (mustForcePasswordChange) return;
                    setAccountUsername(String((user as any)?.username ?? ""));
                    setAccountName(String((user as any)?.name ?? ""));
                    setAccountEmail(String((user as any)?.email ?? ""));
                    setIsAccountDialogOpen(true);
                  }}
                  className="cursor-pointer"
                >
                  <UserCog className="mr-2 h-4 w-4" />
                  <span>Account Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setIsPasswordDialogOpen(true)}
                  className="cursor-pointer"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  <span>تغيير كلمة المرور</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    void handleSignOut();
                  }}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-3 sm:p-4 overflow-x-hidden">{children}</main>
      </SidebarInset>

      <Dialog
        open={isAccountDialogOpen}
        onOpenChange={(open) => {
          setIsAccountDialogOpen(open);
          if (!open) {
            setAccountUsername(String((user as any)?.username ?? ""));
            setAccountName(String((user as any)?.name ?? ""));
            setAccountEmail(String((user as any)?.email ?? ""));
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Account Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullNameEditable">Full Name</Label>
              <Input
                id="fullNameEditable"
                value={accountName}
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailEditable">Email</Label>
              <Input
                id="emailEditable"
                type="email"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usernameEditable">Username</Label>
              <Input
                id="usernameEditable"
                value={accountUsername}
                onChange={(e) => setAccountUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !changeUsernameMutation.isPending) {
                    void handleUpdateUsername();
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsAccountDialogOpen(false)}
                disabled={changeUsernameMutation.isPending || updateProfileMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const profileOk = await handleUpdateProfile();
                  if (!profileOk) return;
                  const usernameOk = await handleUpdateUsername();
                  if (!usernameOk) return;
                  setIsAccountDialogOpen(false);
                }}
                disabled={changeUsernameMutation.isPending || updateProfileMutation.isPending}
              >
                {changeUsernameMutation.isPending || updateProfileMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPasswordDialogOpen}
        onOpenChange={(open) => {
          if (mustForcePasswordChange && !open) return;
          setIsPasswordDialogOpen(open);
          if (!open) {
            setPasswordForm({
              currentPassword: "",
              newPassword: "",
              confirmPassword: "",
            });
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onInteractOutside={(e) => {
            if (mustForcePasswordChange) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (mustForcePasswordChange) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {mustForcePasswordChange && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                For Security, You Must Change Your Password Before Continuing.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="currentPassword">كلمة المرور الحالية</Label>
              <Input
                id="currentPassword"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    currentPassword: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    newPassword: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">تأكيد كلمة المرور الجديدة</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    confirmPassword: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !changePasswordMutation.isPending) {
                    void handleChangePassword();
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              {!mustForcePasswordChange && (
                <Button
                  variant="outline"
                  onClick={() => setIsPasswordDialogOpen(false)}
                  disabled={changePasswordMutation.isPending}
                >
                  إلغاء
                </Button>
              )}
              <Button
                onClick={() => void handleChangePassword()}
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? "جارٍ الحفظ..." : "حفظ"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
