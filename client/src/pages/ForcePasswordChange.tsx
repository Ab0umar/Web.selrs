import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getTrpcErrorMessage } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export default function ForcePasswordChange() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changeUsernameMutation = trpc.auth.changeUsername.useMutation({
    onSuccess: async () => {
      toast.success("تم تحديث اسم المستخدم");
      await utils.auth.me.invalidate();
    },
  });

  const changePasswordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      toast.success("تم تحديث كلمة المرور");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await utils.auth.me.invalidate();
      setLocation("/dashboard");
    },
  });

  useEffect(() => {
    setUsername(String((user as any)?.username ?? ""));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!(user as any).mustChangePassword) {
      setLocation("/dashboard");
    }
  }, [setLocation, user]);

  const submitUsername = async () => {
    const next = username.trim();
    if (!next) {
      toast.error("اسم المستخدم مطلوب");
      return;
    }
    if (next.length < 3) {
      toast.error("اسم المستخدم يجب أن يكون 3 أحرف على الأقل");
      return;
    }
    try {
      await changeUsernameMutation.mutateAsync({ username: next });
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "فشل تحديث اسم المستخدم"));
    }
  };

  const submitPassword = async () => {
    const current = currentPassword.trim();
    const next = newPassword.trim();
    const confirm = confirmPassword.trim();
    if (!current || !next || !confirm) {
      toast.error("يرجى ملء جميع حقول كلمة المرور");
      return;
    }
    if (next.length < 6) {
      toast.error("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (next !== confirm) {
      toast.error("تأكيد كلمة المرور غير متطابق");
      return;
    }
    if (next === current) {
      toast.error("كلمة المرور الجديدة يجب أن تكون مختلفة");
      return;
    }
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword: current,
        newPassword: next,
      });
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "فشل تحديث كلمة المرور"));
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>إعداد أمني مطلوب</CardTitle>
          <CardDescription>
            يجب تغيير كلمة المرور للمتابعة. الاسم الكامل للعرض فقط.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="fullNameReadonly">الاسم الكامل</Label>
              <Input id="fullNameReadonly" value={String((user as any)?.name ?? "")} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usernameEditable">اسم المستخدم</Label>
              <div className="flex gap-2">
                <Input
                  id="usernameEditable"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <Button
                  type="button"
                  onClick={submitUsername}
                  disabled={changeUsernameMutation.isPending}
                >
                  {changeUsernameMutation.isPending ? " ..." : ""}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="currentPasswordRequired">كلمة المرور الحالية</Label>
              <Input
                id="currentPasswordRequired"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPasswordRequired">كلمة المرور الجديدة</Label>
              <Input
                id="newPasswordRequired"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPasswordRequired">تأكيد كلمة المرور الجديدة</Label>
              <Input
                id="confirmPasswordRequired"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !changePasswordMutation.isPending) {
                    void submitPassword();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={submitPassword}
              disabled={changePasswordMutation.isPending}
            >
              {changePasswordMutation.isPending ? " ..." : "   "}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
