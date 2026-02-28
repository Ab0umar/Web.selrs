import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

const SOURCE_FILE = path.resolve("client/src/data/readyPrescriptionTemplates.ts");
const OUTPUT_FILE = path.resolve("روشتات", "ready_prescriptions_multisheet_import.xlsx");

function sanitizeCell(value) {
  const text = String(value ?? "");
  // Keep only XML 1.0 valid chars for Excel.
  const xmlSafe = text
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, "")
    .replace(/[\uFFFE\uFFFF]/g, "");
  // Excel cell text limit is 32767 characters.
  return xmlSafe.length > 32767 ? xmlSafe.slice(0, 32767) : xmlSafe;
}

function extractArrayLiteral(sourceText) {
  const marker = "export const READY_PRESCRIPTION_TEMPLATES";
  const markerIndex = sourceText.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error("Could not find READY_PRESCRIPTION_TEMPLATES export.");
  }

  const start = sourceText.indexOf("[", markerIndex);
  if (start === -1) {
    throw new Error("Could not find templates array start.");
  }

  const end = sourceText.lastIndexOf("];");
  if (end === -1 || end <= start) {
    throw new Error("Could not find templates array end.");
  }

  return sourceText.slice(start, end + 1);
}

function toTemplates(arrayLiteral) {
  const value = Function(`"use strict"; return (${arrayLiteral});`)();
  if (!Array.isArray(value)) {
    throw new Error("Templates payload is not an array.");
  }
  return value;
}

function sanitizeSheetName(input, used) {
  const base = String(input || "Sheet")
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/^'+|'+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "Sheet";

  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

async function main() {
  const src = await fs.readFile(SOURCE_FILE, "utf8");
  const arrayLiteral = extractArrayLiteral(src);
  const templates = toTemplates(arrayLiteral);

  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set();

  for (const template of templates) {
    const templateBaseId = sanitizeCell(template.id || "");
    const templateName = sanitizeCell(template.name || "");
    const templateKey = `t${usedSheetNames.size + 1}_${templateBaseId || "template"}`;

    const rows = (template.items || []).map((item) => ({
      templateKey,
      templateId: templateBaseId,
      templateName,
      medicationName: sanitizeCell(item.medicationName || ""),
      dosage: sanitizeCell(item.dosage || ""),
      frequency: sanitizeCell(item.frequency || ""),
      duration: sanitizeCell(item.duration || ""),
      instructions: sanitizeCell(item.instructions || ""),
    }));

    const sheetName = sanitizeSheetName(
      `${template.name || template.id || "Template"}`,
      usedSheetNames
    );
    const worksheet = XLSX.utils.json_to_sheet(
      rows.length
        ? rows
        : [
            {
              templateKey,
              templateId: templateBaseId,
              templateName,
              medicationName: "",
              dosage: "",
              frequency: "",
              duration: "",
              instructions: "",
            },
          ]
    );
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  XLSX.writeFile(workbook, OUTPUT_FILE);
  console.log(`Created workbook: ${OUTPUT_FILE}`);
  console.log(`Templates/pages exported: ${templates.length}`);
}

main().catch((error) => {
  console.error("Failed to build multi-sheet workbook:", error);
  process.exit(1);
});
