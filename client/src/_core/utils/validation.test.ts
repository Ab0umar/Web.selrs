import { describe, it, expect } from "vitest";
import {
  validatePatientName,
  validatePhoneNumber,
  validateEmail,
  validateDate,
  validateDateOfBirth,
  validateAge,
  validateRequired,
  validateTextField,
  validateNumberField,
  validatePatientData,
  validateAppointmentData,
  validatePrescriptionData,
} from "./validation";

describe("Validation Utils", () => {
  describe("validatePatientName", () => {
    it("should reject empty name", () => {
      expect(validatePatientName("")).not.toBeNull();
    });

    it("should reject name with less than 3 characters", () => {
      expect(validatePatientName("أ")).not.toBeNull();
    });

    it("should accept valid name", () => {
      expect(validatePatientName("أحمد محمد")).toBeNull();
    });

    it("should reject name with more than 100 characters", () => {
      const longName = "أ".repeat(101);
      expect(validatePatientName(longName)).not.toBeNull();
    });
  });

  describe("validatePhoneNumber", () => {
    it("should accept null/empty phone", () => {
      expect(validatePhoneNumber("")).toBeNull();
    });

    it("should accept valid phone numbers", () => {
      expect(validatePhoneNumber("01012345678")).toBeNull();
      expect(validatePhoneNumber("+201012345678")).toBeNull();
      expect(validatePhoneNumber("(010) 1234-5678")).toBeNull();
    });

    it("should reject invalid phone numbers", () => {
      expect(validatePhoneNumber("123")).not.toBeNull();
      expect(validatePhoneNumber("abcdefghij")).not.toBeNull();
    });
  });

  describe("validateEmail", () => {
    it("should accept null/empty email", () => {
      expect(validateEmail("")).toBeNull();
    });

    it("should accept valid emails", () => {
      expect(validateEmail("test@example.com")).toBeNull();
      expect(validateEmail("user.name@domain.co.uk")).toBeNull();
    });

    it("should reject invalid emails", () => {
      expect(validateEmail("invalid-email")).not.toBeNull();
      expect(validateEmail("@example.com")).not.toBeNull();
      expect(validateEmail("user@")).not.toBeNull();
    });
  });

  describe("validateDate", () => {
    it("should reject empty date", () => {
      expect(validateDate("", "التاريخ")).not.toBeNull();
    });

    it("should accept valid date", () => {
      expect(validateDate("2024-01-15", "التاريخ")).toBeNull();
    });

    it("should reject invalid date", () => {
      expect(validateDate("invalid-date", "التاريخ")).not.toBeNull();
    });
  });

  describe("validateDateOfBirth", () => {
    it("should accept null/empty date of birth", () => {
      expect(validateDateOfBirth("")).toBeNull();
    });

    it("should accept valid date of birth", () => {
      const validDOB = "1990-01-15";
      expect(validateDateOfBirth(validDOB)).toBeNull();
    });

    it("should reject future date", () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const dateString = futureDate.toISOString().split("T")[0];
      expect(validateDateOfBirth(dateString)).not.toBeNull();
    });

    it("should reject unrealistic age", () => {
      const oldDate = "1800-01-15";
      expect(validateDateOfBirth(oldDate)).not.toBeNull();
    });
  });

  describe("validateAge", () => {
    it("should accept null/empty age", () => {
      expect(validateAge("")).toBeNull();
    });

    it("should accept valid age", () => {
      expect(validateAge("30")).toBeNull();
      expect(validateAge("0")).toBeNull();
      expect(validateAge("150")).toBeNull();
    });

    it("should reject invalid age", () => {
      expect(validateAge("-1")).not.toBeNull();
      expect(validateAge("151")).not.toBeNull();
      expect(validateAge("abc")).not.toBeNull();
    });
  });

  describe("validateRequired", () => {
    it("should reject empty values", () => {
      expect(validateRequired("", "الحقل")).not.toBeNull();
      expect(validateRequired(null, "الحقل")).not.toBeNull();
      expect(validateRequired(undefined, "الحقل")).not.toBeNull();
    });

    it("should accept non-empty values", () => {
      expect(validateRequired("value", "الحقل")).toBeNull();
      expect(validateRequired("0", "الحقل")).toBeNull();
    });
  });

  describe("validateTextField", () => {
    it("should validate required text field", () => {
      expect(validateTextField("", "الحقل", 0, 1000, true)).not.toBeNull();
      expect(validateTextField("text", "الحقل", 0, 1000, true)).toBeNull();
    });

    it("should validate minimum length", () => {
      expect(validateTextField("ab", "الحقل", 3, 1000)).not.toBeNull();
      expect(validateTextField("abc", "الحقل", 3, 1000)).toBeNull();
    });

    it("should validate maximum length", () => {
      expect(validateTextField("abcde", "الحقل", 0, 3)).not.toBeNull();
      expect(validateTextField("abc", "الحقل", 0, 3)).toBeNull();
    });
  });

  describe("validateNumberField", () => {
    it("should validate required number field", () => {
      expect(validateNumberField("", "الحقل", undefined, undefined, true)).not.toBeNull();
      expect(validateNumberField("10", "الحقل", undefined, undefined, true)).toBeNull();
    });

    it("should validate minimum value", () => {
      expect(validateNumberField("5", "الحقل", 10)).not.toBeNull();
      expect(validateNumberField("10", "الحقل", 10)).toBeNull();
    });

    it("should validate maximum value", () => {
      expect(validateNumberField("15", "الحقل", undefined, 10)).not.toBeNull();
      expect(validateNumberField("10", "الحقل", undefined, 10)).toBeNull();
    });

    it("should reject non-numeric values", () => {
      expect(validateNumberField("abc", "الحقل")).not.toBeNull();
    });
  });

  describe("validatePatientData", () => {
    it("should validate complete patient data", () => {
      const validData = {
        patientName: "أحمد محمد",
        phone: "01012345678",
        email: "test@example.com",
        dateOfBirth: "1990-01-15",
        age: "30",
      };
      const result = validatePatientData(validData);
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors).length).toBe(0);
    });

    it("should detect multiple errors", () => {
      const invalidData = {
        patientName: "",
        phone: "123",
        email: "invalid",
        dateOfBirth: "invalid",
        age: "200",
      };
      const result = validatePatientData(invalidData);
      expect(result.isValid).toBe(false);
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    });
  });

  describe("validateAppointmentData", () => {
    it("should validate complete appointment data", () => {
      const validData = {
        patientId: 1,
        appointmentDate: "2024-01-15",
        appointmentTime: "10:00",
        doctorId: 1,
      };
      const result = validateAppointmentData(validData);
      expect(result.isValid).toBe(true);
    });

    it("should detect missing required fields", () => {
      const invalidData = {
        patientId: null,
        appointmentDate: "",
        appointmentTime: "",
        doctorId: null,
      };
      const result = validateAppointmentData(invalidData);
      expect(result.isValid).toBe(false);
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    });
  });

  describe("validatePrescriptionData", () => {
    it("should validate complete prescription data", () => {
      const validData = {
        medicationName: "الأسبرين",
        dosage: "500 ملغ",
        frequency: "مرتين يومياً",
        duration: "7 أيام",
      };
      const result = validatePrescriptionData(validData);
      expect(result.isValid).toBe(true);
    });

    it("should detect missing required fields", () => {
      const invalidData = {
        medicationName: "",
        dosage: "",
        frequency: "",
        duration: "",
      };
      const result = validatePrescriptionData(invalidData);
      expect(result.isValid).toBe(false);
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    });
  });
});
