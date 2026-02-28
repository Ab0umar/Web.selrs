export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.\-_/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeServiceCodeForSearch(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const noDecimal = raw.replace(/\.0+$/, "");
  const lower = noDecimal.toLowerCase();
  if (/^\d+$/.test(lower)) {
    const stripped = lower.replace(/^0+/, "");
    return stripped || "0";
  }
  return lower;
}

export function matchesDoctorFilter(params: {
  doctorValue: unknown;
  selectedDoctor: string;
  selectedDoctorName?: string;
  selectedDoctorCode?: string;
}): boolean {
  const selected = normalizeSearchText(params.selectedDoctor);
  if (!selected) return true;
  const doctorNorm = normalizeSearchText(params.doctorValue);
  const selectedNameNorm = normalizeSearchText(params.selectedDoctorName ?? params.selectedDoctor);
  const selectedCodeNorm = normalizeSearchText(params.selectedDoctorCode ?? "");
  return (
    doctorNorm === selectedNameNorm ||
    (selectedNameNorm ? doctorNorm.includes(selectedNameNorm) : false) ||
    (selectedCodeNorm ? doctorNorm.includes(selectedCodeNorm) : false) ||
    doctorNorm === selected
  );
}

export function matchesServiceCodeOrNameTerm(term: string, serviceCode: string, serviceName: string): boolean {
  const normalizedTerm = String(term ?? "").trim().toLowerCase();
  if (!normalizedTerm) return true;
  return (
    String(serviceCode ?? "").toLowerCase().includes(normalizedTerm) ||
    String(serviceName ?? "").toLowerCase().includes(normalizedTerm)
  );
}

