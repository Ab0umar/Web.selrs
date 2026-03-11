import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CalendarDays, FileImage, LayoutDashboard, Search, Settings, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

type GlobalSearchResult = {
  patients: Array<{
    id: number;
    patientCode: string;
    fullName: string;
    phone?: string | null;
    treatingDoctor?: string | null;
  }>;
  documents: Array<{
    id: number;
    type: "pentacam";
    title: string;
    fileName: string;
    patientId: number;
    patientCode: string;
    patientName: string;
    capturedAt: string | null;
    openUrl: string;
    route: string;
  }>;
};

function formatDate(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) return raw;
  return parsed.toLocaleDateString();
}

export default function GlobalCommandPalette() {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();

  const searchQuery = trpc.medical.globalSearch.useQuery(
    { query, limit: 8 },
    {
      enabled: isAuthenticated && query.trim().length >= 2,
      refetchOnWindowFocus: false,
      staleTime: 15000,
    }
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isShortcut) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const data = (searchQuery.data ?? { patients: [], documents: [] }) as GlobalSearchResult;

  const quickLinks = useMemo(() => {
    const items = [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { label: "Patients", path: "/patients", icon: UserRound },
      { label: "Appointments", path: "/appointments", icon: CalendarDays },
    ];
    if (String(user?.role ?? "").toLowerCase() === "admin") {
      items.push({ label: "Admin Settings", path: "/admin/settings", icon: Settings });
    }
    return items;
  }, [user?.role]);

  if (!isAuthenticated) return null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Global Search"
      description="Search patients, Pentacam documents, and navigate quickly."
      className="sm:max-w-2xl"
    >
      <CommandInput
        placeholder="Search patients, codes, phones, Pentacam files..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {query.trim().length < 2 ? "Type at least 2 characters" : "No results found"}
        </CommandEmpty>

        <CommandGroup heading="Quick Actions">
          {quickLinks.map((item) => (
            <CommandItem
              key={item.path}
              value={`nav-${item.label}`}
              onSelect={() => {
                setOpen(false);
                setLocation(item.path);
              }}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {query.trim().length >= 2 ? <CommandSeparator /> : null}

        {data.patients.length > 0 ? (
          <CommandGroup heading="Patients">
            {data.patients.map((patient) => (
              <CommandItem
                key={`patient-${patient.id}`}
                value={`patient-${patient.patientCode}-${patient.fullName}`}
                onSelect={() => {
                  setOpen(false);
                  setLocation(`/patients/${patient.id}`);
                }}
              >
                <UserRound className="h-4 w-4" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{patient.patientCode} | {patient.fullName}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {patient.phone || "-"} {patient.treatingDoctor ? `| ${patient.treatingDoctor}` : ""}
                  </span>
                </div>
                <CommandShortcut>Open</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {data.documents.length > 0 ? (
          <CommandGroup heading="Documents">
            {data.documents.map((doc) => (
              <CommandItem
                key={`doc-${doc.type}-${doc.id}`}
                value={`doc-${doc.fileName}-${doc.patientCode}-${doc.patientName}`}
                onSelect={() => {
                  setOpen(false);
                  if (doc.patientId > 0) {
                    setLocation(doc.route);
                    return;
                  }
                  window.open(doc.openUrl, "_blank", "noopener,noreferrer");
                }}
              >
                <FileImage className="h-4 w-4" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{doc.patientCode || "No code"} | {doc.title}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {doc.patientName || doc.fileName} {doc.capturedAt ? `| ${formatDate(doc.capturedAt)}` : ""}
                  </span>
                </div>
                <CommandShortcut>{doc.type === "pentacam" ? "Pentacam" : "Doc"}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {searchQuery.isFetching ? (
          <CommandGroup heading="Status">
            <CommandItem value="searching" disabled>
              <Search className="h-4 w-4" />
              <span>Searching...</span>
            </CommandItem>
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
