import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Shield, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { getTrpcErrorMessage } from "@/lib/utils";

type MigrationRow = {
  name: string;
  appliedAt?: string | null;
  pending: boolean;
};

export default function AdminMigrations() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const migrationsQuery = trpc.system.listMigrations.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const applyMutation = trpc.system.applyMigrations.useMutation({
    onSuccess: async (result: { applied: number }) => {
      if (result.applied > 0) {
        toast.success(`تم تطبيق ${result.applied} ترحيل`);
      } else {
        toast.info("لا توجد ترحيلات معلقة للتطبيق");
      }
      await utils.system.listMigrations.invalidate();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "تعذر تطبيق الترحيلات"));
    },
  });

  const pendingCount = useMemo(() => {
    return (migrationsQuery.data?.migrations ?? []).filter((m) => m.pending).length;
  }, [migrationsQuery.data]);

  const handleRefresh = async () => {
    const result = await migrationsQuery.refetch();
    if (result.error) {
      toast.error(getTrpcErrorMessage(result.error, "تعذر تحديث قائمة الترحيلات"));
      return;
    }
    toast.success("تم تحديث قائمة الترحيلات");
  };

  const handleApply = async () => {
    await applyMutation.mutateAsync({});
  };

  if (user?.role !== "admin") {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">لا توجد صلاحيات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">أنت لا تملك صلاحية الوصول لهذه الصفحة.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-indigo-600" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={migrationsQuery.isFetching}>
            <RefreshCcw className="h-4 w-4 ml-2" />
            {migrationsQuery.isFetching ? " ..." : ""}
          </Button>
          <Button
            onClick={handleApply}
            disabled={pendingCount === 0 || applyMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {applyMutation.isPending
              ? "  ..."
              : `تطبيق الترحيلات (${pendingCount})`}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة الترحيلات</CardTitle>
        </CardHeader>
        <CardContent>
          {migrationsQuery.isLoading && (
            <p className="text-muted-foreground">جاري تحميل الترحيلات...</p>
          )}
          {!migrationsQuery.isLoading && (migrationsQuery.data?.migrations ?? []).length === 0 && (
            <p className="text-muted-foreground">لا توجد ترحيلات.</p>
          )}
          {!migrationsQuery.isLoading && migrationsQuery.data?.source === "journal" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              تم استخدام سجل drizzle لعرض الترحيلات لأن الاتصال بقاعدة البيانات فشل.
              {migrationsQuery.data.dbError ? ` : ${migrationsQuery.data.dbError}` : ""}
            </div>
          )}
          <div className="space-y-3">
            {(migrationsQuery.data?.migrations ?? []).map((migration: MigrationRow) => (
              <div
                key={migration.name}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{migration.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {migration.appliedAt ? `Applied: ${migration.appliedAt}` : "Not Applied"}
                  </p>
                </div>
                <Badge variant={migration.pending ? "destructive" : "outline"}>
                  {migration.pending ? "Pending" : "Applied"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6">
        <Button variant="outline" onClick={() => setLocation("/dashboard?tab=admin")}>
          العودة إلى لوحة التحكم
        </Button>
      </div>
    </div>
  );
}

