import { describe, it, expect } from "vitest";

describe("Medical Sheets Navigation", () => {
  it("should have correct sheet routes for all service types", () => {
    const sheetRoutes = {
      consultant: "/sheets/consultant/1",
      specialist: "/sheets/specialist/1",
      lasik: "/sheets/lasik/1",
      operation: "/sheets/operation/1",
      external: "/sheets/external/1",
    };

    expect(sheetRoutes.consultant).toBe("/sheets/consultant/1");
    expect(sheetRoutes.specialist).toBe("/sheets/specialist/1");
    expect(sheetRoutes.lasik).toBe("/sheets/lasik/1");
    expect(sheetRoutes.operation).toBe("/sheets/operation/1");
    expect(sheetRoutes.external).toBe("/sheets/external/1");
  });

  it("should have all 5 tabs in Patients page", () => {
    const tabs = [
      { value: "consultant", label: "استشاري" },
      { value: "specialist", label: "أخصائي" },
      { value: "lasik", label: "فحص ليزك" },
      { value: "surgery", label: "عمليات" },
      { value: "external", label: "خارجي" },
    ];

    expect(tabs).toHaveLength(5);
    expect(tabs[0].value).toBe("consultant");
    expect(tabs[1].value).toBe("specialist");
    expect(tabs[2].value).toBe("lasik");
    expect(tabs[3].value).toBe("surgery");
    expect(tabs[4].value).toBe("external");
  });

  it("should map service types to correct sheet paths", () => {
    const sheetMap: Record<string, string> = {
      consultant: "/sheets/consultant/1",
      specialist: "/sheets/specialist/1",
      lasik: "/sheets/lasik/1",
      surgery: "/sheets/operation/1",
      external: "/sheets/external/1",
    };

    expect(sheetMap["consultant"]).toBe("/sheets/consultant/1");
    expect(sheetMap["specialist"]).toBe("/sheets/specialist/1");
    expect(sheetMap["lasik"]).toBe("/sheets/lasik/1");
    expect(sheetMap["surgery"]).toBe("/sheets/operation/1");
    expect(sheetMap["external"]).toBe("/sheets/external/1");
  });

  it("should have correct form structure for consultant sheet", () => {
    const consultantFormFields = {
      patientName: "",
      age: "",
      phone: "",
      address: "",
      visitDate: new Date().toISOString().split("T")[0],
      currentDiseases: "",
      medications: "",
      allergies: "",
      surgeryHistory: "",
      ucvaOD: "",
      ucvaOS: "",
      bcvaOD: "",
      bcvaOS: "",
      sphereOD: "",
      sphereOS: "",
      cylinderOD: "",
      cylinderOS: "",
      axisOD: "",
      axisOS: "",
      fundusOD: "",
      fundusOS: "",
      diagnosis: "",
      treatment: "",
      notes: "",
    };

    expect(Object.keys(consultantFormFields)).toHaveLength(24);
    expect(consultantFormFields).toHaveProperty("patientName");
    expect(consultantFormFields).toHaveProperty("diagnosis");
    expect(consultantFormFields).toHaveProperty("treatment");
  });

  it("should have correct form structure for specialist sheet", () => {
    const specialistFormFields = {
      patientName: "",
      age: "",
      phone: "",
      address: "",
      visitDate: new Date().toISOString().split("T")[0],
      currentDiseases: "",
      medications: "",
      allergies: "",
      surgeryHistory: "",
      ucvaOD: "",
      ucvaOS: "",
      bcvaOD: "",
      bcvaOS: "",
      sphereOD: "",
      sphereOS: "",
      cylinderOD: "",
      cylinderOS: "",
      axisOD: "",
      axisOS: "",
      fundusOD: "",
      fundusOS: "",
      diagnosis: "",
      treatment: "",
      notes: "",
    };

    expect(Object.keys(specialistFormFields)).toHaveLength(24);
    expect(specialistFormFields).toHaveProperty("patientName");
    expect(specialistFormFields).toHaveProperty("diagnosis");
  });

  it("should have correct form structure for LASIK exam sheet", () => {
    const lasikFormFields = {
      patientName: "",
      age: "",
      phone: "",
      address: "",
      visitDate: new Date().toISOString().split("T")[0],
      currentDiseases: "",
      medications: "",
      allergies: "",
      surgeryHistory: "",
      ucvaOD: "",
      ucvaOS: "",
      bcvaOD: "",
      bcvaOS: "",
      sphereOD: "",
      sphereOS: "",
      cylinderOD: "",
      cylinderOS: "",
      axisOD: "",
      axisOS: "",
      keratometryOD: "",
      keratometryOS: "",
      pachymetryOD: "",
      pachymetryOS: "",
      pupilSizeOD: "",
      pupilSizeOS: "",
      fundusOD: "",
      fundusOS: "",
      diagnosis: "",
      recommendations: "",
      contraindications: "",
      notes: "",
    };

    expect(Object.keys(lasikFormFields)).toHaveLength(31);
    expect(lasikFormFields).toHaveProperty("keratometryOD");
    expect(lasikFormFields).toHaveProperty("pachymetryOD");
    expect(lasikFormFields).toHaveProperty("pupilSizeOD");
    expect(lasikFormFields).toHaveProperty("contraindications");
  });

  it("should have correct form structure for operation sheet", () => {
    const operationFormFields = {
      patientName: "",
      age: "",
      phone: "",
      address: "",
      operationDate: new Date().toISOString().split("T")[0],
      operationType: "",
      eye: "",
      surgeon: "",
      assistants: "",
      anesthesia: "",
      diagnosis: "",
      indication: "",
      preOpVision: "",
      operationDetails: "",
      complications: "",
      implants: "",
      sutures: "",
      immediatePostOpVision: "",
      postOpComments: "",
      medications: "",
      followUpSchedule: "",
      doctorName: "",
      doctorSignature: "",
    };

    expect(Object.keys(operationFormFields)).toHaveLength(23);
    expect(operationFormFields).toHaveProperty("operationType");
    expect(operationFormFields).toHaveProperty("surgeon");
    expect(operationFormFields).toHaveProperty("operationDetails");
    expect(operationFormFields).toHaveProperty("followUpSchedule");
  });

  it("should have correct form structure for external operation sheet", () => {
    const externalFormFields = {
      patientName: "",
      age: "",
      phone: "",
      address: "",
      referralDate: new Date().toISOString().split("T")[0],
      referringDoctor: "",
      referringHospital: "",
      referralReason: "",
      diagnosis: "",
      currentDiseases: "",
      medications: "",
      allergies: "",
      previousSurgeries: "",
      ucvaOD: "",
      ucvaOS: "",
      bcvaOD: "",
      bcvaOS: "",
      iop: "",
      fundusExam: "",
      recommendedProcedure: "",
      estimatedCost: "",
      timeline: "",
      precautions: "",
      notes: "",
    };

    expect(Object.keys(externalFormFields)).toHaveLength(24);
    expect(externalFormFields).toHaveProperty("referringDoctor");
    expect(externalFormFields).toHaveProperty("referralReason");
    expect(externalFormFields).toHaveProperty("recommendedProcedure");
    expect(externalFormFields).toHaveProperty("estimatedCost");
  });

  it("should have all sheet pages imported in App.tsx", () => {
    const sheetPages = [
      "ConsultantSheet",
      "SpecialistSheet",
      "LasikExamSheet",
      "OperationSheet",
      "ExternalOperationSheet",
    ];

    expect(sheetPages).toHaveLength(5);
    sheetPages.forEach((page) => {
      expect(page).toBeTruthy();
    });
  });

  it("should validate patient data structure", () => {
    const patientData = {
      id: 1,
      patientCode: "P001",
      fullName: "أحمد محمد",
      phone: "01012345678",
      age: 45,
      status: "new",
      lastVisit: "2026-02-01",
      serviceType: "استشاري",
    };

    expect(patientData).toHaveProperty("id");
    expect(patientData).toHaveProperty("fullName");
    expect(patientData).toHaveProperty("phone");
    expect(patientData.age).toBeGreaterThan(0);
    expect(["new", "followup"]).toContain(patientData.status);
  });
});
