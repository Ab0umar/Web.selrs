export interface ReadyPrescriptionTemplateItem {
  medicationName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface ReadyPrescriptionTemplate {
  id: string;
  name: string;
  sourceFile: string;
  items: ReadyPrescriptionTemplateItem[];
}

export const READY_PRESCRIPTION_TEMPLATES: ReadyPrescriptionTemplate[] = [];
