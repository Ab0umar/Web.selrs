import { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  helperText?: string;
}

export function FormField({
  label,
  error,
  required = false,
  children,
  helperText,
}: FormFieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      <div className={error ? "border-destructive" : ""}>{children}</div>
      {error && (
        <div className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
      {helperText && !error && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
