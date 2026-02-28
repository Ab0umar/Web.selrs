export type SheetCssKey = "consultant" | "specialist" | "lasik" | "external";
export type SheetTemplateKey = SheetCssKey;
export type SheetLayoutConfig = {
  offsetXmm: number;
  offsetYmm: number;
  scale: number;
};

export type BaseSheetTemplateConfig = {
  sheetTitle: string;
  patientInfoTitle: string;
  doctorLabel: string;
  examinationDateLabel: string;
  notesLabel: string;
  signatureLabel: string;
};

export type FollowupTemplateConfig = {
  rtLabel: string;
  ltLabel: string;
  operationTypeLabel: string;
  operationDateLabel: string;
  nextFollowupLabel: string;
  followupDateLabel: string;
  vaLabel: string;
  refractionLabel: string;
  flapLabel: string;
  edgesLabel: string;
  bedLabel: string;
  iopLabel: string;
  treatmentLabel: string;
  receptionLabel: string;
  nurseLabel: string;
  doctorLabel: string;
  followupNames: [string, string, string, string];
  offsetXmm: number;
  offsetYmm: number;
  scale: number;
  tableGapMm: number;
};

export type RefractionPrintConfig = {
  nameLabel: string;
  vaLabel: string;
  colourLabel: string;
  dateLabel: string;
  rightTitle: string;
  leftTitle: string;
  distLabel: string;
  nearLabel: string;
  sLabel: string;
  cLabel: string;
  aLabel: string;
  pdLabel: string;
  metaFontSizePx: number;
  titleFontSizePx: number;
  tableFontSizePx: number;
  rowLabelFontSizePx: number;
  rowHeightPx: number;
  cardWidthMm: number;
  topOffsetMm: number;
};

export type SheetDesignerConfig = {
  css: Record<SheetCssKey, string>;
  layout: Record<SheetCssKey, SheetLayoutConfig>;
  templates: Record<SheetTemplateKey, BaseSheetTemplateConfig>;
  followupConsultant: FollowupTemplateConfig;
  followupLasik: FollowupTemplateConfig;
  refractionPrint: RefractionPrintConfig;
};

export const SHEET_DESIGNER_KEY = "selrs_sheet_designer_v1";

const DEFAULT_FOLLOWUP_TEMPLATE: FollowupTemplateConfig = {
  rtLabel: "RT",
  ltLabel: "LT",
  operationTypeLabel: "نوع العملية",
  operationDateLabel: "تاريخ العملية",
  nextFollowupLabel: "المتابعة القادمة",
  followupDateLabel: "تاريخ المتابعة",
  vaLabel: "V. A",
  refractionLabel: "Refraction",
  flapLabel: "Flap",
  edgesLabel: "Edges",
  bedLabel: "Bed",
  iopLabel: "I.O.P",
  treatmentLabel: "Treatment",
  receptionLabel: "استقبال:",
  nurseLabel: "تمريض:",
  doctorLabel: "طبيب:",
  followupNames: ["المتابعة الأولى", "المتابعة الثانية", "المتابعة الثالثة", "المتابعة الرابعة"],
  offsetXmm: 4,
  offsetYmm: 10,
  scale: 0.96,
  tableGapMm: 11,
};

export const DEFAULT_SHEET_DESIGNER_CONFIG: SheetDesignerConfig = {
  css: {
    consultant: "",
    specialist: "",
    lasik: "",
    external: "",
  },
  layout: {
    consultant: { offsetXmm: 0, offsetYmm: 0, scale: 1 },
    specialist: { offsetXmm: 0, offsetYmm: 0, scale: 1 },
    lasik: { offsetXmm: 0, offsetYmm: 0, scale: 1 },
    external: { offsetXmm: 0, offsetYmm: 0, scale: 1 },
  },
  templates: {
    consultant: {
      sheetTitle: "Consultant Sheet",
      patientInfoTitle: "Patient Information",
      doctorLabel: "الطبيب",
      examinationDateLabel: "Examination Date",
      notesLabel: "Notes",
      signatureLabel: "Signature",
    },
    specialist: {
      sheetTitle: "Specialist Sheet",
      patientInfoTitle: "Patient Information",
      doctorLabel: "Doctor",
      examinationDateLabel: "Examination Date",
      notesLabel: "Notes",
      signatureLabel: "Signature",
    },
    lasik: {
      sheetTitle: "LASIK Sheet",
      patientInfoTitle: "Patient Information",
      doctorLabel: "Doctor",
      examinationDateLabel: "Examination Date",
      notesLabel: "Notes",
      signatureLabel: "Signature",
    },
    external: {
      sheetTitle: "External Operation Sheet",
      patientInfoTitle: "Patient Information",
      doctorLabel: "Doctor",
      examinationDateLabel: "Examination Date",
      notesLabel: "Notes",
      signatureLabel: "Signature",
    },
  },
  followupConsultant: { ...DEFAULT_FOLLOWUP_TEMPLATE },
  followupLasik: { ...DEFAULT_FOLLOWUP_TEMPLATE },
  refractionPrint: {
    nameLabel: "Name",
    vaLabel: "V. A",
    colourLabel: "Colour",
    dateLabel: "Date",
    rightTitle: "RIGHT",
    leftTitle: "LEFT",
    distLabel: "DIST",
    nearLabel: "NEAR",
    sLabel: "S",
    cLabel: "C",
    aLabel: "A",
    pdLabel: "PD",
    metaFontSizePx: 14,
    titleFontSizePx: 18,
    tableFontSizePx: 18,
    rowLabelFontSizePx: 16,
    rowHeightPx: 74,
    cardWidthMm: 132,
    topOffsetMm: 28,
  },
};

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function coerceSheetDesignerConfig(input: unknown): SheetDesignerConfig {
  try {
    const parsed = (input ?? {}) as Partial<SheetDesignerConfig> & {
      followup?: Partial<FollowupTemplateConfig>;
      followupConsultant?: Partial<FollowupTemplateConfig>;
      followupLasik?: Partial<FollowupTemplateConfig>;
    };
    const legacyFollowup: Partial<FollowupTemplateConfig> = parsed.followup ?? {};
    const followupConsultantSource: Partial<FollowupTemplateConfig> = parsed.followupConsultant ?? legacyFollowup;
    const followupLasikSource: Partial<FollowupTemplateConfig> =
      parsed.followupLasik ?? parsed.followupConsultant ?? legacyFollowup;
    const refractionPrint: Partial<RefractionPrintConfig> = parsed.refractionPrint ?? {};
    const consultantNames = Array.isArray(followupConsultantSource.followupNames)
      ? followupConsultantSource.followupNames.slice(0, 4)
      : [];
    const lasikNames = Array.isArray(followupLasikSource.followupNames)
      ? followupLasikSource.followupNames.slice(0, 4)
      : [];
    const rawConsultantDoctorLabel = parsed.templates?.consultant?.doctorLabel;
    const consultantDoctorLabel =
      rawConsultantDoctorLabel === "Doctor" || !rawConsultantDoctorLabel
        ? DEFAULT_SHEET_DESIGNER_CONFIG.templates.consultant.doctorLabel
        : rawConsultantDoctorLabel;

    return {
      css: {
        consultant: parsed.css?.consultant ?? DEFAULT_SHEET_DESIGNER_CONFIG.css.consultant,
        specialist: parsed.css?.specialist ?? DEFAULT_SHEET_DESIGNER_CONFIG.css.specialist,
        lasik: parsed.css?.lasik ?? DEFAULT_SHEET_DESIGNER_CONFIG.css.lasik,
        external: parsed.css?.external ?? DEFAULT_SHEET_DESIGNER_CONFIG.css.external,
      },
      layout: {
        consultant: {
          offsetXmm: toNumber(parsed.layout?.consultant?.offsetXmm, DEFAULT_SHEET_DESIGNER_CONFIG.layout.consultant.offsetXmm),
          offsetYmm: toNumber(parsed.layout?.consultant?.offsetYmm, DEFAULT_SHEET_DESIGNER_CONFIG.layout.consultant.offsetYmm),
          scale: toNumber(parsed.layout?.consultant?.scale, DEFAULT_SHEET_DESIGNER_CONFIG.layout.consultant.scale),
        },
        specialist: {
          offsetXmm: toNumber(parsed.layout?.specialist?.offsetXmm, DEFAULT_SHEET_DESIGNER_CONFIG.layout.specialist.offsetXmm),
          offsetYmm: toNumber(parsed.layout?.specialist?.offsetYmm, DEFAULT_SHEET_DESIGNER_CONFIG.layout.specialist.offsetYmm),
          scale: toNumber(parsed.layout?.specialist?.scale, DEFAULT_SHEET_DESIGNER_CONFIG.layout.specialist.scale),
        },
        lasik: {
          offsetXmm: toNumber(parsed.layout?.lasik?.offsetXmm, DEFAULT_SHEET_DESIGNER_CONFIG.layout.lasik.offsetXmm),
          offsetYmm: toNumber(parsed.layout?.lasik?.offsetYmm, DEFAULT_SHEET_DESIGNER_CONFIG.layout.lasik.offsetYmm),
          scale: toNumber(parsed.layout?.lasik?.scale, DEFAULT_SHEET_DESIGNER_CONFIG.layout.lasik.scale),
        },
        external: {
          offsetXmm: toNumber(parsed.layout?.external?.offsetXmm, DEFAULT_SHEET_DESIGNER_CONFIG.layout.external.offsetXmm),
          offsetYmm: toNumber(parsed.layout?.external?.offsetYmm, DEFAULT_SHEET_DESIGNER_CONFIG.layout.external.offsetYmm),
          scale: toNumber(parsed.layout?.external?.scale, DEFAULT_SHEET_DESIGNER_CONFIG.layout.external.scale),
        },
      },
      templates: {
        consultant: {
          sheetTitle: parsed.templates?.consultant?.sheetTitle ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.consultant.sheetTitle,
          patientInfoTitle:
            parsed.templates?.consultant?.patientInfoTitle ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.consultant.patientInfoTitle,
          doctorLabel: consultantDoctorLabel,
          examinationDateLabel:
            parsed.templates?.consultant?.examinationDateLabel ??
            DEFAULT_SHEET_DESIGNER_CONFIG.templates.consultant.examinationDateLabel,
          notesLabel: parsed.templates?.consultant?.notesLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.consultant.notesLabel,
          signatureLabel:
            parsed.templates?.consultant?.signatureLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.consultant.signatureLabel,
        },
        specialist: {
          sheetTitle: parsed.templates?.specialist?.sheetTitle ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.specialist.sheetTitle,
          patientInfoTitle:
            parsed.templates?.specialist?.patientInfoTitle ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.specialist.patientInfoTitle,
          doctorLabel: parsed.templates?.specialist?.doctorLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.specialist.doctorLabel,
          examinationDateLabel:
            parsed.templates?.specialist?.examinationDateLabel ??
            DEFAULT_SHEET_DESIGNER_CONFIG.templates.specialist.examinationDateLabel,
          notesLabel: parsed.templates?.specialist?.notesLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.specialist.notesLabel,
          signatureLabel:
            parsed.templates?.specialist?.signatureLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.specialist.signatureLabel,
        },
        lasik: {
          sheetTitle: parsed.templates?.lasik?.sheetTitle ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.lasik.sheetTitle,
          patientInfoTitle:
            parsed.templates?.lasik?.patientInfoTitle ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.lasik.patientInfoTitle,
          doctorLabel: parsed.templates?.lasik?.doctorLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.lasik.doctorLabel,
          examinationDateLabel:
            parsed.templates?.lasik?.examinationDateLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.lasik.examinationDateLabel,
          notesLabel: parsed.templates?.lasik?.notesLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.lasik.notesLabel,
          signatureLabel: parsed.templates?.lasik?.signatureLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.lasik.signatureLabel,
        },
        external: {
          sheetTitle: parsed.templates?.external?.sheetTitle ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.external.sheetTitle,
          patientInfoTitle:
            parsed.templates?.external?.patientInfoTitle ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.external.patientInfoTitle,
          doctorLabel: parsed.templates?.external?.doctorLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.external.doctorLabel,
          examinationDateLabel:
            parsed.templates?.external?.examinationDateLabel ??
            DEFAULT_SHEET_DESIGNER_CONFIG.templates.external.examinationDateLabel,
          notesLabel: parsed.templates?.external?.notesLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.external.notesLabel,
          signatureLabel:
            parsed.templates?.external?.signatureLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.templates.external.signatureLabel,
        },
      },
      followupConsultant: {
        rtLabel: followupConsultantSource.rtLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.rtLabel,
        ltLabel: followupConsultantSource.ltLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.ltLabel,
        operationTypeLabel:
          followupConsultantSource.operationTypeLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.operationTypeLabel,
        operationDateLabel:
          followupConsultantSource.operationDateLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.operationDateLabel,
        nextFollowupLabel:
          followupConsultantSource.nextFollowupLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.nextFollowupLabel,
        followupDateLabel:
          followupConsultantSource.followupDateLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.followupDateLabel,
        vaLabel: followupConsultantSource.vaLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.vaLabel,
        refractionLabel:
          followupConsultantSource.refractionLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.refractionLabel,
        flapLabel: followupConsultantSource.flapLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.flapLabel,
        edgesLabel: followupConsultantSource.edgesLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.edgesLabel,
        bedLabel: followupConsultantSource.bedLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.bedLabel,
        iopLabel: followupConsultantSource.iopLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.iopLabel,
        treatmentLabel:
          followupConsultantSource.treatmentLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.treatmentLabel,
        receptionLabel:
          followupConsultantSource.receptionLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.receptionLabel,
        nurseLabel: followupConsultantSource.nurseLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.nurseLabel,
        doctorLabel: followupConsultantSource.doctorLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.doctorLabel,
        followupNames: [
          consultantNames[0] ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.followupNames[0],
          consultantNames[1] ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.followupNames[1],
          consultantNames[2] ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.followupNames[2],
          consultantNames[3] ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.followupNames[3],
        ],
        offsetXmm: toNumber(
          followupConsultantSource.offsetXmm,
          DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.offsetXmm
        ),
        offsetYmm: toNumber(
          followupConsultantSource.offsetYmm,
          DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.offsetYmm
        ),
        scale: toNumber(followupConsultantSource.scale, DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.scale),
        tableGapMm: toNumber(
          followupConsultantSource.tableGapMm,
          DEFAULT_SHEET_DESIGNER_CONFIG.followupConsultant.tableGapMm
        ),
      },
      followupLasik: {
        rtLabel: followupLasikSource.rtLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.rtLabel,
        ltLabel: followupLasikSource.ltLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.ltLabel,
        operationTypeLabel:
          followupLasikSource.operationTypeLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.operationTypeLabel,
        operationDateLabel:
          followupLasikSource.operationDateLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.operationDateLabel,
        nextFollowupLabel:
          followupLasikSource.nextFollowupLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.nextFollowupLabel,
        followupDateLabel:
          followupLasikSource.followupDateLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.followupDateLabel,
        vaLabel: followupLasikSource.vaLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.vaLabel,
        refractionLabel: followupLasikSource.refractionLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.refractionLabel,
        flapLabel: followupLasikSource.flapLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.flapLabel,
        edgesLabel: followupLasikSource.edgesLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.edgesLabel,
        bedLabel: followupLasikSource.bedLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.bedLabel,
        iopLabel: followupLasikSource.iopLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.iopLabel,
        treatmentLabel: followupLasikSource.treatmentLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.treatmentLabel,
        receptionLabel: followupLasikSource.receptionLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.receptionLabel,
        nurseLabel: followupLasikSource.nurseLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.nurseLabel,
        doctorLabel: followupLasikSource.doctorLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.doctorLabel,
        followupNames: [
          lasikNames[0] ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.followupNames[0],
          lasikNames[1] ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.followupNames[1],
          lasikNames[2] ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.followupNames[2],
          lasikNames[3] ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.followupNames[3],
        ],
        offsetXmm: toNumber(followupLasikSource.offsetXmm, DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.offsetXmm),
        offsetYmm: toNumber(followupLasikSource.offsetYmm, DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.offsetYmm),
        scale: toNumber(followupLasikSource.scale, DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.scale),
        tableGapMm: toNumber(followupLasikSource.tableGapMm, DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik.tableGapMm),
      },
      refractionPrint: {
        nameLabel: refractionPrint.nameLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.nameLabel,
        vaLabel: refractionPrint.vaLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.vaLabel,
        colourLabel: refractionPrint.colourLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.colourLabel,
        dateLabel: refractionPrint.dateLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.dateLabel,
        rightTitle: refractionPrint.rightTitle ?? DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.rightTitle,
        leftTitle: refractionPrint.leftTitle ?? DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.leftTitle,
        distLabel: refractionPrint.distLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.distLabel,
        nearLabel: refractionPrint.nearLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.nearLabel,
        sLabel: refractionPrint.sLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.sLabel,
        cLabel: refractionPrint.cLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.cLabel,
        aLabel: refractionPrint.aLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.aLabel,
        pdLabel: refractionPrint.pdLabel ?? DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.pdLabel,
        metaFontSizePx: toNumber(refractionPrint.metaFontSizePx, DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.metaFontSizePx),
        titleFontSizePx: toNumber(refractionPrint.titleFontSizePx, DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.titleFontSizePx),
        tableFontSizePx: toNumber(refractionPrint.tableFontSizePx, DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.tableFontSizePx),
        rowLabelFontSizePx: toNumber(
          refractionPrint.rowLabelFontSizePx,
          DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.rowLabelFontSizePx
        ),
        rowHeightPx: toNumber(refractionPrint.rowHeightPx, DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.rowHeightPx),
        cardWidthMm: toNumber(refractionPrint.cardWidthMm, DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.cardWidthMm),
        topOffsetMm: toNumber(refractionPrint.topOffsetMm, DEFAULT_SHEET_DESIGNER_CONFIG.refractionPrint.topOffsetMm),
      },
    };
  } catch {
    return DEFAULT_SHEET_DESIGNER_CONFIG;
  }
}

export function loadSheetDesignerConfig(): SheetDesignerConfig {
  if (typeof window === "undefined") return DEFAULT_SHEET_DESIGNER_CONFIG;
  const raw = localStorage.getItem(SHEET_DESIGNER_KEY);
  if (!raw) return DEFAULT_SHEET_DESIGNER_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    return coerceSheetDesignerConfig(parsed);
  } catch {
    return DEFAULT_SHEET_DESIGNER_CONFIG;
  }
}

export function saveSheetDesignerConfig(config: SheetDesignerConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SHEET_DESIGNER_KEY, JSON.stringify(config));
}
