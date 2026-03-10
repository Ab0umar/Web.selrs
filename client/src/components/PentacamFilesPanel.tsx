import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getTrpcErrorMessage } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

type PentacamFilesPanelProps = {
  patientId?: number | null;
  compact?: boolean;
};

function formatDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.valueOf())) return raw;
  return dt.toLocaleString();
}

function normalizeUrl(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return value;
  return `/${value}`;
}

export default function PentacamFilesPanel({ patientId, compact = false }: PentacamFilesPanelProps) {
  const targetPatientId = Number(patientId ?? 0);
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const filesQuery = trpc.medical.getPentacamFilesByPatient.useQuery(
    { patientId: targetPatientId, limit: compact ? 20 : 100 },
    {
      enabled: targetPatientId > 0,
      refetchOnWindowFocus: false,
      refetchInterval: 4000,
    }
  );
  const removeLinkMutation = trpc.medical.removePentacamLink.useMutation();

  const files = useMemo(() => (Array.isArray(filesQuery.data) ? filesQuery.data : []), [filesQuery.data]);
  const selectedIds = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, checked]) => Boolean(checked))
        .map(([id]) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    [selected]
  );

  useEffect(() => {
    const valid = new Set(
      files
        .map((row: any) => Number(row?.id ?? 0))
        .filter((id: number) => Number.isFinite(id) && id > 0)
    );
    setSelected((prev: Record<number, boolean>) => {
      const next: Record<number, boolean> = {};
      for (const [idRaw, checked] of Object.entries(prev)) {
        const id = Number(idRaw);
        if (valid.has(id)) next[id] = Boolean(checked);
      }
      return next;
    });
  }, [files]);

  async function removeSelected() {
    if (selectedIds.length === 0) return;
    try {
      for (const resultId of selectedIds) {
        await removeLinkMutation.mutateAsync({ resultId });
      }
      toast.success(`Removed ${selectedIds.length} link(s).`);
      setSelected({});
      await utils.medical.getPentacamFilesByPatient.invalidate({
        patientId: targetPatientId,
        limit: compact ? 20 : 100,
      });
    } catch (error: unknown) {
      toast.error(getTrpcErrorMessage(error, "Failed to remove selected links."));
    }
  }

  if (!targetPatientId) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">Select patient first.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">بنتاكام</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={() => filesQuery.refetch()} disabled={filesQuery.isFetching}>
          <RefreshCw className={`h-4 w-4 ${filesQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={removeSelected}
          disabled={removeLinkMutation.isPending || selectedIds.length === 0}
        >
          {removeLinkMutation.isPending ? "Removing..." : `Remove Selected (${selectedIds.length})`}
        </Button>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No Pentacam files yet for this patient.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((row: any) => {
              const url = normalizeUrl(row?.storageUrl);
              const mimeType = String(row?.mimeType ?? "");
              const isImage = mimeType.startsWith("image/");
              const status = String(row?.importStatus ?? "");
              const fileName = String(row?.sourceFileName ?? "file");
              return (
                <div key={row?.id ?? `${fileName}-${row?.importedAt ?? ""}`} className="rounded border p-2 space-y-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[Number(row?.id ?? 0)])}
                      onChange={(e) => {
                        const resultId = Number(row?.id ?? 0);
                        if (!Number.isFinite(resultId) || resultId <= 0) return;
                        setSelected((prev: Record<number, boolean>) => ({ ...prev, [resultId]: e.target.checked }));
                      }}
                    />
                    Select
                  </label>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={status === "imported" ? "default" : "secondary"}>{status || "unknown"}</Badge>
                    <span className="text-xs text-muted-foreground">{String(row?.eyeSide ?? "")}</span>
                  </div>
                  {url && isImage ? (
                    <a href={url} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={url}
                        alt={fileName}
                        className="h-40 w-full rounded object-cover border"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <a href={url || "#"} target="_blank" rel="noreferrer" className="block rounded border p-3 text-sm text-center hover:bg-muted">
                      Open file
                    </a>
                  )}
                  <div className="text-xs text-muted-foreground break-all">{fileName}</div>
                  <div className="text-[11px] text-muted-foreground">{formatDate(row?.capturedAt || row?.importedAt)}</div>
                  <div className="pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={removeLinkMutation.isPending}
                      onClick={async () => {
                        const resultId = Number(row?.id ?? 0);
                        if (!Number.isFinite(resultId) || resultId <= 0) return;
                        try {
                          await removeLinkMutation.mutateAsync({ resultId });
                          toast.success("Pentacam link removed.");
                          await utils.medical.getPentacamFilesByPatient.invalidate({
                            patientId: targetPatientId,
                            limit: compact ? 20 : 100,
                          });
                        } catch (error: unknown) {
                          toast.error(getTrpcErrorMessage(error, "Failed to remove Pentacam link."));
                        }
                      }}
                    >
                      Remove Link
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

