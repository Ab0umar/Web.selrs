import { ArrowRight } from "lucide-react";

type PageHeaderProps = {
  backTo: string;
  label?: string;
  hideOnPrint?: boolean;
};

export default function PageHeader({ backTo, label = "العودة", hideOnPrint = true }: PageHeaderProps) {
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = backTo;
  };

  return (
    <>
      <header
        className={`bg-primary text-primary-foreground shadow-lg sticky top-0 z-[120] pointer-events-auto ${
          hideOnPrint ? "print:hidden" : ""
        }`}
      >
        <div className="container mx-auto px-4 py-2">
          <div className="h-1" />
        </div>
      </header>
      <div className={`border-b bg-background ${hideOnPrint ? "print:hidden" : ""}`}>
        <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            {label}
          </button>
          <a href="/dashboard" className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm hover:bg-muted">
            الصفحة الرئيسية
          </a>
        </div>
      </div>
    </>
  );
}
