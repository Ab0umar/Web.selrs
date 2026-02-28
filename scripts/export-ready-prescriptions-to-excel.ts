import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { READY_PRESCRIPTION_TEMPLATES } from "../client/src/data/readyPrescriptionTemplates";

type ExportRow = {
  templateId: string;
  templateName: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
};

function toRows(): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const template of READY_PRESCRIPTION_TEMPLATES) {
    for (const item of template.items) {
      rows.push({
        templateId: template.id,
        templateName: template.name,
        medicationName: item.medicationName ?? "",
        dosage: item.dosage ?? "",
        frequency: item.frequency ?? "",
        duration: item.duration ?? "",
        instructions: item.instructions ?? "",
      });
    }
  }
  return rows;
}

async function main() {
  const outDir = path.join(process.cwd(), "Doc");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "ready_prescriptions_import.xlsx");

  const rows = toRows();
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "ready_prescriptions");
  XLSX.writeFile(workbook, outPath);

  console.log(`Exported ${rows.length} rows to ${outPath}`);
}

main().catch((error) => {
  console.error("Failed to export ready prescriptions Excel:", error);
  process.exit(1);
});

