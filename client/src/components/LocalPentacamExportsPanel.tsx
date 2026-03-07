import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getTrpcErrorMessage } from "@/lib/utils";

type LocalExportItem = {
  name: string;
  size: number;
  mtime: string;
  url: string;
};

type ApiResponse = {
  ok: boolean;
  files: LocalExportItem[];
  count: number;
  error?: string;
};

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return parsed.toLocaleString();
}

function formatSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

type LocalPentacamExportsPanelProps = {
  patientId?: number | null;
};

type UnmatchedSuggestion = {
  fileName: string;
  candidates: Array<{
    patientId: number;
    patientCode: string;
    fullName: string;
    matchedBy: string;
    score: number;
  }>;
};

type PatientSearchResult = {
  patientId: number;
  patientCode: string;
  fullName: string;
};

function extractNameHintFromPentacamFile(fileName: string): string {
  const stem = String(fileName ?? "").replace(/\.[^.]+$/, "");
  return stem.replace(/_(OD|OS)_\d{8}_\d{6}_.+$/i, "").replace(/_/g, " ").trim();
}

export default function LocalPentacamExportsPanel({ patientId }: LocalPentacamExportsPanelProps) {
  const PAGE_SIZE = 24;
  const [items, setItems] = useState<LocalExportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [nameFilter, setNameFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [lastAutoWireSignature, setLastAutoWireSignature] = useState("");
  const [unmatchedSuggestions, setUnmatchedSuggestions] = useState<UnmatchedSuggestion[]>([]);
  const [manualSearchTermByFile, setManualSearchTermByFile] = useState<Record<string, string>>({});
  const [manualSearchResultsByFile, setManualSearchResultsByFile] = useState<Record<string, PatientSearchResult[]>>({});
  const [manualSearchLoadingByFile, setManualSearchLoadingByFile] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState(false);
  const targetPatientId = Number(patientId ?? 0);
  const utils = trpc.useUtils();
  const importMutation = trpc.medical.importLocalPentacamExports.useMutation();
  const autoImportMutation = trpc.medical.autoImportLocalPentacamExports.useMutation();
  const unmatchedSuggestionsMutation = trpc.medical.getUnmatchedLocalPentacamSuggestions.useMutation();
  const searchPentacamPatientsMutation = trpc.medical.searchPentacamPatients.useMutation();

  const hasItems = useMemo(() => items.length > 0, [items.length]);
  const filteredItems = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    const from = dateFrom.trim();
    const to = dateTo.trim();

    const extractDate = (fileName: string): string => {
      const match = fileName.match(/_(\d{8})_(\d{6})_/);
      if (!match) return "";
      const token = String(match[1] ?? "");
      if (token.length !== 8) return "";
      const dd = token.slice(0, 2);
      const mm = token.slice(2, 4);
      const yyyy = token.slice(4, 8);
      return `${yyyy}-${mm}-${dd}`;
    };

    return items.filter((item) => {
      const lowerName = item.name.toLowerCase();
      if (q && !lowerName.includes(q)) return false;
      const d = extractDate(item.name);
      if (from && (!d || d < from)) return false;
      if (to && (!d || d > to)) return false;
      return true;
    });
  }, [items, nameFilter, dateFrom, dateTo]);
  const visibleItems = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount]);
  const selectedNames = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, isChecked]) => Boolean(isChecked))
        .map(([name]) => name),
    [selected]
  );
  const canImport = targetPatientId > 0 && selectedNames.length > 0 && !importMutation.isPending;
  const canAutoImport = filteredItems.length > 0 && !autoImportMutation.isPending;
  const autoWireSignature = useMemo(
    () => items.map((item) => item.name).sort().join("|"),
    [items]
  );

  async function autoImportByBatches(fileNames: string[]) {
    const unique = Array.from(new Set(fileNames.map((name) => String(name ?? "").trim()).filter(Boolean)));
    const batchSize = 1000;
    let imported = 0;
    let unmatched = 0;
    let skipped = 0;
    let missing = 0;
    const unresolvedFiles: string[] = [];
    for (let i = 0; i < unique.length; i += batchSize) {
      const chunk = unique.slice(i, i + batchSize);
      const result = await autoImportMutation.mutateAsync({ fileNames: chunk });
      imported += Number(result.imported ?? 0);
      unmatched += Number(result.unmatched ?? 0);
      skipped += Number(result.skipped ?? 0);
      missing += Number(result.missing ?? 0);
      if (Array.isArray((result as any).unresolvedFiles)) {
        unresolvedFiles.push(...(result as any).unresolvedFiles.map((value: unknown) => String(value ?? "").trim()).filter(Boolean));
      }
    }
    return { imported, unmatched, skipped, missing, unresolvedFiles: Array.from(new Set(unresolvedFiles)) };
  }

  async function loadUnmatchedSuggestions(fileNames: string[]) {
    const unique = Array.from(new Set(fileNames.map((value) => String(value ?? "").trim()).filter(Boolean)));
    if (unique.length === 0) {
      setUnmatchedSuggestions([]);
      return;
    }
    try {
      const result = await unmatchedSuggestionsMutation.mutateAsync({
        fileNames: unique.slice(0, 2000),
        limitPerFile: 3,
      });
      const rows = Array.isArray(result?.suggestions) ? (result.suggestions as UnmatchedSuggestion[]) : [];
      setUnmatchedSuggestions(rows);
      setManualSearchTermByFile((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (!next[row.fileName]) next[row.fileName] = extractNameHintFromPentacamFile(row.fileName);
        }
        return next;
      });
    } catch (error: unknown) {
      toast.error(getTrpcErrorMessage(error, "Failed to load unmatched suggestions."));
    }
  }

  async function searchPatientsForFile(fileName: string) {
    const query = String(manualSearchTermByFile[fileName] ?? "").trim();
    if (!query) return;
    setManualSearchLoadingByFile((prev) => ({ ...prev, [fileName]: true }));
    try {
      const rows = await searchPentacamPatientsMutation.mutateAsync({ searchTerm: query, limit: 10 });
      setManualSearchResultsByFile((prev) => ({ ...prev, [fileName]: Array.isArray(rows) ? rows : [] }));
    } catch (error: unknown) {
      toast.error(getTrpcErrorMessage(error, "Patient search failed."));
    } finally {
      setManualSearchLoadingByFile((prev) => ({ ...prev, [fileName]: false }));
    }
  }

  async function linkSuggestion(fileName: string, patientId: number) {
    try {
      const result = await importMutation.mutateAsync({
        patientId,
        fileNames: [fileName],
      });
      if (Number(result.imported ?? 0) > 0) {
        toast.success(`Linked ${fileName}`);
        setUnmatchedSuggestions((prev) => prev.filter((entry) => entry.fileName !== fileName));
        setManualSearchResultsByFile((prev) => {
          const next = { ...prev };
          delete next[fileName];
          return next;
        });
        if (targetPatientId > 0) {
          await utils.medical.getPentacamFilesByPatient.invalidate({ patientId: targetPatientId, limit: 100 });
        }
      } else {
        toast.info(`No change for ${fileName} (already linked or missing).`);
      }
    } catch (error: unknown) {
      toast.error(getTrpcErrorMessage(error, "Failed to link file."));
    }
  }


  async function loadExports() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pentacam/exports?limit=10000", { credentials: "same-origin" });
      const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
      if (!contentType.includes("application/json")) {
        const preview = (await response.text()).slice(0, 160).replace(/\s+/g, " ").trim();
        throw new Error(`Expected JSON from /api/pentacam/exports but received ${contentType || "unknown"}: ${preview}`);
      }
      const json = (await response.json()) as ApiResponse;
      if (!json.ok) {
        setItems([]);
        setSelected({});
        setError(json.error || "Could not load local Pentacam exports.");
        return;
      }
      const list = Array.isArray(json.files) ? json.files : [];
      setItems(list);
      setVisibleCount(PAGE_SIZE);
      setSelected((prev) => {
        const next: Record<string, boolean> = {};
        for (const item of list) {
          next[item.name] = Boolean(prev[item.name]);
        }
        return next;
      });
    } catch (err: any) {
      setItems([]);
      setSelected({});
      setError(String(err?.message || "Could not load local Pentacam exports."));
    } finally {
      setLoading(false);
    }
  }

  async function autoImportFiltered() {
    const names = filteredItems.map((item) => item.name);
    if (names.length === 0) {
      toast.error("No files to auto-link.");
      return;
    }
    try {
      const result = await autoImportByBatches(names);
      toast.success(
        `Auto-linked ${result.imported}, unmatched ${result.unmatched}, skipped ${result.skipped}, missing ${result.missing}.`
      );
      if (result.unmatched > 0) {
        await loadUnmatchedSuggestions(result.unresolvedFiles);
      } else {
        setUnmatchedSuggestions([]);
      }
      if (targetPatientId > 0) {
        await utils.medical.getPentacamFilesByPatient.invalidate({ patientId: targetPatientId, limit: 100 });
      }
    } catch (error: unknown) {
      toast.error(getTrpcErrorMessage(error, "Failed to auto-link Pentacam exports."));
    }
  }
  async function importSelected() {
    if (!targetPatientId) {
      toast.error("Select a patient first.");
      return;
    }
    if (selectedNames.length === 0) {
      toast.error("Select at least one image.");
      return;
    }
    try {
      const result = await importMutation.mutateAsync({
        patientId: targetPatientId,
        fileNames: selectedNames,
      });
      toast.success(`Imported ${result.imported}, skipped ${result.skipped}, missing ${result.missing}.`);
      await utils.medical.getPentacamFilesByPatient.invalidate({ patientId: targetPatientId, limit: 100 });
    } catch (error: unknown) {
      toast.error(getTrpcErrorMessage(error, "Failed to import Pentacam exports."));
    }
  }

  useEffect(() => {
    loadExports();
  }, []);

  useEffect(() => {
    if (!autoWireSignature) return;
    if (autoWireSignature === lastAutoWireSignature) return;
    if (autoImportMutation.isPending) return;
    setLastAutoWireSignature(autoWireSignature);
    autoImportByBatches(items.map((item) => item.name))
      .then(async (result) => {
        toast.info(
          `Auto-wire: imported ${result.imported}, unmatched ${result.unmatched}, skipped ${result.skipped}, missing ${result.missing}.`
        );
        if (result.unmatched > 0) {
          await loadUnmatchedSuggestions(result.unresolvedFiles);
        } else {
          setUnmatchedSuggestions([]);
        }
        if (targetPatientId > 0) {
          await utils.medical.getPentacamFilesByPatient.invalidate({ patientId: targetPatientId, limit: 100 });
        }
      })
      .catch((error: unknown) => {
        toast.error(getTrpcErrorMessage(error, "Auto-wire failed."));
      });
  }, [
    autoWireSignature,
    lastAutoWireSignature,
    autoImportMutation,
    items,
    targetPatientId,
    utils.medical.getPentacamFilesByPatient,
  ]);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [nameFilter, dateFrom, dateTo]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Local Pentacam Exports</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={importSelected}
            disabled={!canImport}
          >
            {importMutation.isPending ? "Importing..." : `Import Selected (${selectedNames.length})`}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={autoImportFiltered}
            disabled={!canAutoImport}
          >
            {autoImportMutation.isPending ? "Auto-linking..." : "Auto-wire filtered"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={loadExports} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      {expanded ? <CardContent>
        {targetPatientId <= 0 ? (
          <div className="text-sm text-muted-foreground mb-3">
            Select a patient above, then choose images and click import.
          </div>
        ) : null}
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Filter by name/code/file"
            className="h-9 rounded border px-2 text-sm"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded border px-2 text-sm"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded border px-2 text-sm"
          />
        </div>
        {hasItems ? (
          <div className="mb-3 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const next: Record<string, boolean> = {};
              for (const item of visibleItems) next[item.name] = true;
              setSelected(next);
            }}
          >
              Select visible
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelected({})}
            >
              Clear
            </Button>
            <div className="text-xs text-muted-foreground">
              Showing {Math.min(visibleCount, filteredItems.length)} of {filteredItems.length} (total {items.length})
            </div>
          </div>
        ) : null}
        {!hasItems && !error ? (
          <div className="text-sm text-muted-foreground">No exported files found in the `Pentacam` folder.</div>
        ) : null}
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {unmatchedSuggestions.length > 0 ? (
          <div className="mb-4 rounded border p-3 space-y-2">
            <div className="text-sm font-medium">
              Unmatched Suggestions ({unmatchedSuggestions.length}) - Manual linking only
            </div>
            <div className="space-y-2 max-h-72 overflow-auto pr-1">
              {unmatchedSuggestions.map((entry) => (
                <div key={entry.fileName} className="rounded border p-2 text-xs space-y-2">
                  <div className="break-all font-medium">{entry.fileName}</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={manualSearchTermByFile[entry.fileName] ?? ""}
                      onChange={(e) =>
                        setManualSearchTermByFile((prev) => ({ ...prev, [entry.fileName]: e.target.value }))
                      }
                      placeholder="Search patient Arabic/English"
                      className="h-8 rounded border px-2 text-xs w-full"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => searchPatientsForFile(entry.fileName)}
                      disabled={Boolean(manualSearchLoadingByFile[entry.fileName])}
                    >
                      {manualSearchLoadingByFile[entry.fileName] ? "Searching..." : "Search"}
                    </Button>
                  </div>
                  {Array.isArray(manualSearchResultsByFile[entry.fileName]) &&
                  manualSearchResultsByFile[entry.fileName].length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {manualSearchResultsByFile[entry.fileName].map((row) => (
                        <Button
                          key={`${entry.fileName}-manual-${row.patientId}`}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => linkSuggestion(entry.fileName, row.patientId)}
                          disabled={importMutation.isPending}
                        >
                          {row.patientCode} {row.fullName}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {hasItems ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((item) => (
              <div
                key={`${item.name}-${item.mtime}`}
                className="rounded border p-2 space-y-2 hover:bg-muted/30 transition-colors"
              >
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[item.name])}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [item.name]: e.target.checked }))}
                  />
                  Select
                </label>
                <a href={item.url} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={item.url}
                    alt={item.name}
                    className="h-24 w-full rounded object-cover border"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
                <div className="text-xs break-all">{item.name}</div>
                <div className="text-[11px] text-muted-foreground">{formatDate(item.mtime)}</div>
                <div className="text-[11px] text-muted-foreground">{formatSize(item.size)}</div>
              </div>
            ))}
          </div>
        ) : null}
        {filteredItems.length > visibleCount ? (
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </CardContent> : null}
    </Card>
  );
}




