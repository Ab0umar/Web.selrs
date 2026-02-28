import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Home() {
  const { loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || "Failed to sign in");
        return;
      }

      if (data?.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }
      if (data?.token) {
        localStorage.setItem("token", String(data.token));
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Failed to sign in");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl">مركز عيون الشروق - SELRS</CardTitle>
          <CardDescription>تسجيل الدخول إلى النظام</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4 text-right">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex items-center gap-3">
              <label htmlFor="username" className="w-28 shrink-0 text-sm font-medium text-right">
                اسم المستخدم
              </label>
              <Input
                id="username"
                type="text"
                placeholder="أدخل اسم المستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="flex-1 text-left"
                dir="ltr"
                disabled={submitting}
                required
              />
            </div>

            <div className="flex items-center gap-3">
              <label htmlFor="password" className="w-28 shrink-0 text-sm font-medium text-right">
                كلمة المرور
              </label>
              <Input
                id="password"
                type="password"
                placeholder="أدخل كلمة المرور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 text-left"
                dir="ltr"
                disabled={submitting}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

