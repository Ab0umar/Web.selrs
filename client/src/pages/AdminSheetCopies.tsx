import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Eye } from "lucide-react";

const SHEET_COPY_LINKS = [
  { key: "consultant", title: "Consultant Copy", path: "/sheets/consultant/0?original=1" },
  { key: "consultant-followup", title: "Consultant Follow-up Copy", path: "/sheets/consultant/0/followup?original=1" },
  { key: "specialist", title: "Specialist Copy", path: "/sheets/specialist/0?original=1" },
  { key: "lasik", title: "LASIK Copy", path: "/sheets/lasik/0?original=1" },
  { key: "lasik-followup", title: "LASIK Follow-up Copy", path: "/sheets/lasik/0/followup?original=1" },
  { key: "external", title: "External Copy", path: "/sheets/external/0?original=1" },
] as const;

export default function AdminSheetCopies() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  if (!isAuthenticated) {
    setLocation("/");
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Sheet Copies (View/Review)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation("/dashboard?tab=admin")}>
            Dashboard
          </Button>
          <Button variant="outline" onClick={() => setLocation("/dashboard")}>
            Home
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SHEET_COPY_LINKS.map((sheet) => (
          <Card key={sheet.key}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {sheet.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => window.open(sheet.path, "_blank", "noopener,noreferrer")}>
                Open Copy
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
