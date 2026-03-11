import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { getTrpcErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

type FailedPentacamSuggestion = {
  patientId: number;
  patientCode: string;
  fullName: string;
  matchedBy: string;
  score: number;
};

type FailedPentacamRow = {
  fileName: string;
  groupKey: string;
  groupLabel: string;
  pageType: string;
  size: number;
  modifiedAt: string;
  previewUrl: string;
  detectedId: string;
  score: number;
  status: string;
  topPasses: Array<{
    pass?: string;
    text?: string;
    candidates?: string[];
  }>;
  suggestions: FailedPentacamSuggestion[];
};

type FailedPentacamGroup = {
  key: string;
  label: string;
  rows: FailedPentacamRow[];
  suggestions: FailedPentacamSuggestion[];
  suggestedId: string;
  latestModifiedAt: string;
};

type RenamePreviewEntry = {
  fileName: string;
  proposedFileName: string;
  willDuplicate: boolean;
};

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function buildTraceText(row: FailedPentacamRow): string {
  return row.topPasses
    .map((pass) => {
      const candidates =
        Array.isArray(pass.candidates) && pass.candidates.length > 0
          ? ` candidates=${pass.candidates.join(", ")}`
          : "";
      return `${pass.pass ?? "pass"}: ${String(pass.text ?? "").trim() || "(empty)"}${candidates}`;
    })
    .join("\n\n");
}

export default function AdminPentacamFailed() {
  const [search, setSearch] = useState("");
  const [manualIds, setManualIds] = useState<Record<string, string>>({});
  const [renamePreview, setRenamePreview] = useState<Record<string, RenamePreviewEntry[]>>({});

  const filesQuery = trpc.medical.listFailedPentacamFiles.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const reviewMutation = trpc.medical.reviewFailedPentacamFile.useMutation({
    onSuccess: async (result) => {
      toast.success(`Renamed to ${result.finalFileName}`);
      setManualIds((prev) => {
        const next = { ...prev };
        delete next[result.fileName];
        return next;
      });
      await filesQuery.refetch();
    },
    onError: (error) => toast.error(getTrpcErrorMessage(error, "Failed to rename file")),
  });

  const reviewGroupMutation = trpc.medical.reviewFailedPentacamGroup.useMutation({
    onSuccess: async (result) => {
      toast.success(`Updated ${result.count} files with ID ${result.idCode}`);
      await filesQuery.refetch();
    },
    onError: (error) => toast.error(getTrpcErrorMessage(error, "Failed to rename group")),
  });

  const releaseMutation = trpc.medical.releaseFailedPentacamFile.useMutation({
    onSuccess: async (result) => {
      toast.success(`Moved back as ${result.finalFileName}`);
      setManualIds((prev) => {
        const next = { ...prev };
        delete next[result.fileName];
        return next;
      });
      await filesQuery.refetch();
    },
    onError: (error) => toast.error(getTrpcErrorMessage(error, "Failed to move file")),
  });

  const previewMutation = trpc.medical.previewFailedPentacamRename.useMutation({
    onError: (error) => toast.error(getTrpcErrorMessage(error, "Failed to preview rename")),
  });

  const retryOcrMutation = trpc.medical.retryFailedPentacamOcr.useMutation({
    onSuccess: async (result) => {
      setManualIds((prev) => ({
        ...prev,
        [result.fileName]: result.detectedId || prev[result.fileName] || "",
      }));
      toast.success(result.detectedId ? `OCR detected ${result.detectedId}` : "OCR retry completed with no ID");
      await filesQuery.refetch();
    },
    onError: (error) => toast.error(getTrpcErrorMessage(error, "Failed to retry OCR")),
  });

  const rows: FailedPentacamRow[] = filesQuery.data ?? [];
  const groups = useMemo(() => {
    const grouped = new Map<string, FailedPentacamGroup>();
    for (const row of rows) {
      const existing = grouped.get(row.groupKey);
      if (!existing) {
        grouped.set(row.groupKey, {
          key: row.groupKey,
          label: row.groupLabel || row.fileName,
          rows: [row],
          suggestions: row.suggestions ?? [],
          suggestedId: row.detectedId || row.suggestions?.[0]?.patientCode || "",
          latestModifiedAt: row.modifiedAt,
        });
        continue;
      }
      existing.rows.push(row);
      if (Date.parse(row.modifiedAt) > Date.parse(existing.latestModifiedAt)) {
        existing.latestModifiedAt = row.modifiedAt;
      }
      if ((!existing.suggestedId || existing.suggestedId.length < 4) && row.detectedId) {
        existing.suggestedId = row.detectedId;
      }
      const merged = [...existing.suggestions];
      for (const suggestion of row.suggestions ?? []) {
        if (!merged.some((item) => item.patientId === suggestion.patientId)) {
          merged.push(suggestion);
        }
      }
      merged.sort((a, b) => b.score - a.score);
      existing.suggestions = merged.slice(0, 3);
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        rows: group.rows.sort((a, b) => a.fileName.localeCompare(b.fileName)),
      }))
      .sort((a, b) => Date.parse(b.latestModifiedAt) - Date.parse(a.latestModifiedAt));
  }, [rows]);

  const groupConfidence = (group: FailedPentacamGroup) => {
    const counts = new Map<string, number>();
    for (const row of group.rows) {
      if (!row.detectedId) continue;
      counts.set(row.detectedId, (counts.get(row.detectedId) ?? 0) + 1);
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (!top) return { label: "No OCR consensus", tone: "muted" as const };
    if (top[1] === group.rows.length) return { label: `Full match ${top[0]}`, tone: "good" as const };
    if (top[1] >= Math.max(2, Math.ceil(group.rows.length / 2))) return { label: `Majority ${top[0]} (${top[1]}/${group.rows.length})`, tone: "warn" as const };
    return { label: `Weak OCR match ${top[0]} (${top[1]}/${group.rows.length})`, tone: "muted" as const };
  };

  const badgeClass = (tone: "good" | "warn" | "muted") =>
    tone === "good"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : tone === "warn"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-slate-300 bg-slate-50 text-slate-700";

  const loadPreview = async (key: string, fileNames: string[], idCode: string) => {
    const result = await previewMutation.mutateAsync({ fileNames, idCode });
    setRenamePreview((prev) => ({
      ...prev,
      [key]: result.files,
    }));
  };

  const filteredGroups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter((group) => {
      if (group.label.toLowerCase().includes(needle)) return true;
      if (group.suggestions.some((item) => item.patientCode.includes(needle) || item.fullName.toLowerCase().includes(needle))) return true;
      return group.rows.some((row) => row.fileName.toLowerCase().includes(needle) || row.detectedId.includes(needle));
    });
  }, [groups, search]);

  const getManualValue = (key: string, fallback: string) => manualIds[key] ?? fallback;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pentacam Failed Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              Files are grouped by patient-like base name. Set one ID for the group, apply it to all related files, or fix single files one by one.
            </div>
            <Button variant="outline" onClick={() => filesQuery.refetch()} disabled={filesQuery.isFetching}>
              Refresh
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, file, or patient code"
            />
            <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
              {filesQuery.isLoading ? "Loading..." : `${filteredGroups.length} groups / ${rows.length} files`}
            </div>
          </div>
        </CardContent>
      </Card>

      {filesQuery.isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {getTrpcErrorMessage(filesQuery.error, "Failed to load Pentacam failed files")}
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-6">
        {filteredGroups.map((group) => {
          const groupValue = getManualValue(group.key, group.suggestedId);
          const confidence = groupConfidence(group);
          const groupPreview = renamePreview[group.key] ?? [];
          return (
            <Card key={group.key}>
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg">{group.label || group.key}</CardTitle>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {group.rows.length} files | latest {new Date(group.latestModifiedAt).toLocaleString()}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 ${badgeClass(confidence.tone)}`}>
                    {confidence.label}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_auto]">
                      <div className="rounded-md border px-3 py-2 text-sm">
                        Suggested ID: <span className="font-semibold">{group.suggestedId || "-"}</span>
                      </div>
                      <Input
                        value={groupValue}
                        onChange={(e) =>
                          setManualIds((prev) => ({
                            ...prev,
                            [group.key]: e.target.value,
                          }))
                        }
                        placeholder="Enter one ID for the full group"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => loadPreview(group.key, group.rows.map((row) => row.fileName), groupValue)}
                          disabled={!groupValue.trim() || previewMutation.isPending}
                        >
                          Preview Rename
                        </Button>
                        <Button
                          onClick={() =>
                            reviewGroupMutation.mutate({
                              fileNames: group.rows.map((row) => row.fileName),
                              idCode: groupValue,
                            })
                          }
                          disabled={!groupValue.trim() || reviewMutation.isPending || reviewGroupMutation.isPending || releaseMutation.isPending}
                        >
                          Apply To Group
                        </Button>
                      </div>
                    </div>

                    {group.suggestions.length > 0 ? (
                      <div className="rounded-md border p-3">
                        <div className="mb-2 text-sm font-medium">Patient suggestions</div>
                        <div className="flex flex-wrap gap-2">
                          {group.suggestions.map((suggestion) => (
                            <Button
                              key={suggestion.patientId}
                              type="button"
                              variant="outline"
                              className="h-auto whitespace-normal px-3 py-2 text-left"
                              onClick={() =>
                                setManualIds((prev) => ({
                                  ...prev,
                                  [group.key]: suggestion.patientCode,
                                }))
                              }
                            >
                              {suggestion.patientCode} | {suggestion.fullName}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {groupPreview.length > 0 ? (
                      <div className="rounded-md border p-3 text-sm">
                        <div className="mb-2 font-medium">
                          Rename preview
                          {groupPreview.some((row) => row.willDuplicate) ? (
                            <span className="ml-2 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900">
                              {groupPreview.filter((row) => row.willDuplicate).length} duplicates
                            </span>
                          ) : null}
                        </div>
                        <div className="space-y-1">
                          {groupPreview.map((item) => (
                            <div key={`${group.key}-${item.fileName}`} className="break-all">
                              {item.willDuplicate ? "dup" : "ok"} | {item.proposedFileName}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-md border p-3 text-sm text-muted-foreground">
                    Applying a group ID updates all files in this set and keeps the rest of each file name unchanged.
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {group.rows.map((row) => {
                    const value = getManualValue(row.fileName, row.detectedId || groupValue);
                    return (
                      <Card key={row.fileName} className="overflow-hidden border-dashed">
                        <CardHeader className="space-y-2">
                          <CardTitle className="break-all text-base">{row.fileName}</CardTitle>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="text-muted-foreground">
                              score {row.score} | {formatFileSize(row.size)} | {new Date(row.modifiedAt).toLocaleString()}
                            </span>
                            <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-slate-700">
                              {row.pageType}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="overflow-hidden rounded-md border bg-muted/20">
                            <img
                              src={row.previewUrl}
                              alt={row.fileName}
                              className="h-[280px] w-full object-contain bg-white"
                              loading="lazy"
                            />
                          </div>

                          <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
                            <div className="rounded-md border px-3 py-2 text-sm">
                              OCR ID: <span className="font-semibold">{row.detectedId || "-"}</span>
                            </div>
                            <Input
                              value={value}
                              onChange={(e) =>
                                setManualIds((prev) => ({
                                  ...prev,
                                  [row.fileName]: e.target.value,
                                }))
                              }
                              placeholder="Enter correct ID"
                            />
                          </div>

                          {row.suggestions.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {row.suggestions.map((suggestion) => (
                                <Button
                                  key={`${row.fileName}-${suggestion.patientId}`}
                                  type="button"
                                  variant="ghost"
                                  className="h-auto px-2 py-1 text-xs"
                                  onClick={() =>
                                    setManualIds((prev) => ({
                                      ...prev,
                                      [row.fileName]: suggestion.patientCode,
                                    }))
                                  }
                                >
                                  {suggestion.patientCode} | {suggestion.fullName}
                                </Button>
                              ))}
                            </div>
                          ) : null}

                          <Textarea value={buildTraceText(row)} readOnly className="min-h-[160px] font-mono text-xs" />

                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => reviewMutation.mutate({ fileName: row.fileName, idCode: value })}
                              disabled={!value.trim() || reviewMutation.isPending || reviewGroupMutation.isPending || releaseMutation.isPending}
                            >
                              Rename One File
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => loadPreview(row.fileName, [row.fileName], value)}
                              disabled={!value.trim() || previewMutation.isPending}
                            >
                              Preview
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => retryOcrMutation.mutate({ fileName: row.fileName })}
                              disabled={retryOcrMutation.isPending || reviewMutation.isPending || reviewGroupMutation.isPending}
                            >
                              Retry OCR
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => releaseMutation.mutate({ fileName: row.fileName })}
                              disabled={reviewMutation.isPending || reviewGroupMutation.isPending || releaseMutation.isPending}
                            >
                              Move As-Is
                            </Button>
                            <Button asChild variant="ghost">
                              <a href={row.previewUrl} target="_blank" rel="noreferrer">
                                Open Image
                              </a>
                            </Button>
                          </div>
                          {(renamePreview[row.fileName] ?? []).length > 0 ? (
                            <div className="rounded-md border p-3 text-sm">
                              {(renamePreview[row.fileName] ?? []).map((item) => (
                                <div key={`${row.fileName}-${item.proposedFileName}`} className="break-all">
                                  {item.willDuplicate ? "dup" : "ok"} | {item.proposedFileName}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!filesQuery.isLoading && filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No failed Pentacam files found.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
