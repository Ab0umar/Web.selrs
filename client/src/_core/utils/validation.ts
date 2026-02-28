/**
 * Validation utilities for medical data
 */

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Validate patient name
 */
export const validatePatientName = (name: string): string | null => {
  if (!name || name.trim().length === 0) {
    return "اسم المريض مطلوب";
  }
  if (name.trim().length < 3) {
    return "اسم المريض يجب أن يكون 3 أحرف على الأقل";
  }
  if (name.trim().length > 100) {
    return "اسم المريض لا يجب أن يتجاوز 100 حرف";
  }
  return null;
};

/**
 * Validate phone number
 */
export const validatePhoneNumber = (phone: string): string | null => {
  if (!phone) return null; // Optional field
  
  const phoneRegex = /^[0-9\-\+\(\)\s]{7,20}$/;
  if (!phoneRegex.test(phone)) {
    return "رقم الهاتف غير صحيح";
  }
  return null;
};

/**
 * Validate email
 */
export const validateEmail = (email: string): string | null => {
  if (!email) return null; // Optional field
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "البريد الإلكتروني غير صحيح";
  }
  return null;
};

/**
 * Validate date
 */
export const validateDate = (date: string, fieldName: string = "التاريخ"): string | null => {
  if (!date) {
    return `${fieldName} مطلوب`;
  }
  
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return `${fieldName} غير صحيح`;
  }
  
  return null;
};

/**
 * Validate date of birth
 */
export const validateDateOfBirth = (dateOfBirth: string): string | null => {
  if (!dateOfBirth) return null; // Optional field
  
  const dateObj = new Date(dateOfBirth);
  if (isNaN(dateObj.getTime())) {
    return "تاريخ الميلاد غير صحيح";
  }
  
  const today = new Date();
  const age = today.getFullYear() - dateObj.getFullYear();
  
  if (age < 0 || age > 150) {
    return "تاريخ الميلاد غير منطقي";
  }
  
  return null;
};

/**
 * Validate age
 */
export const validateAge = (age: string): string | null => {
  if (!age) return null; // Optional field
  
  const ageNum = parseInt(age, 10);
  if (isNaN(ageNum) || ageNum < 0 || ageNum > 150) {
    return "العمر يجب أن يكون بين 0 و 150";
  }
  
  return null;
};

/**
 * Validate required field
 */
export const validateRequired = (value: any, fieldName: string): string | null => {
  if (value === null || value === undefined || value === "") {
    return `${fieldName} مطلوب`;
  }
  return null;
};

/**
 * Validate text field
 */
export const validateTextField = (
  value: string,
  fieldName: string,
  minLength: number = 0,
  maxLength: number = 1000,
  required: boolean = false
): string | null => {
  if (!value && required) {
    return `${fieldName} مطلوب`;
  }
  
  if (value && value.length < minLength) {
    return `${fieldName} يجب أن يكون ${minLength} أحرف على الأقل`;
  }
  
  if (value && value.length > maxLength) {
    return `${fieldName} لا يجب أن يتجاوز ${maxLength} حرف`;
  }
  
  return null;
};

/**
 * Validate number field
 */
export const validateNumberField = (
  value: string,
  fieldName: string,
  min?: number,
  max?: number,
  required: boolean = false
): string | null => {
  if (!value && required) {
    return `${fieldName} مطلوب`;
  }
  
  if (!value) return null;
  
  const num = parseFloat(value);
  if (isNaN(num)) {
    return `${fieldName} يجب أن يكون رقم`;
  }
  
  if (min !== undefined && num < min) {
    return `${fieldName} يجب أن يكون ${min} على الأقل`;
  }
  
  if (max !== undefined && num > max) {
    return `${fieldName} لا يجب أن يتجاوز ${max}`;
  }
  
  return null;
};

/**
 * Validate patient data
 */
export const validatePatientData = (data: any): ValidationResult => {
  const errors: Record<string, string> = {};
  
  const nameError = validatePatientName(data.patientName);
  if (nameError) errors.patientName = nameError;
  
  const phoneError = validatePhoneNumber(data.phone);
  if (phoneError) errors.phone = phoneError;
  
  const emailError = validateEmail(data.email);
  if (emailError) errors.email = emailError;
  
  const dobError = validateDateOfBirth(data.dateOfBirth);
  if (dobError) errors.dateOfBirth = dobError;
  
  const ageError = validateAge(data.age);
  if (ageError) errors.age = ageError;
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Validate appointment data
 */
export const validateAppointmentData = (data: any): ValidationResult => {
  const errors: Record<string, string> = {};
  
  const patientError = validateRequired(data.patientId, "المريض");
  if (patientError) errors.patientId = patientError;
  
  const dateError = validateDate(data.appointmentDate, "تاريخ الموعد");
  if (dateError) errors.appointmentDate = dateError;
  
  const timeError = validateRequired(data.appointmentTime, "وقت الموعد");
  if (timeError) errors.appointmentTime = timeError;
  
  const doctorError = validateRequired(data.doctorId, "الطبيب");
  if (doctorError) errors.doctorId = doctorError;
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Validate prescription data
 */
export const validatePrescriptionData = (data: any): ValidationResult => {
  const errors: Record<string, string> = {};
  
  const medicationError = validateRequired(data.medicationName, "اسم الدواء");
  if (medicationError) errors.medicationName = medicationError;
  
  const dosageError = validateRequired(data.dosage, "الجرعة");
  if (dosageError) errors.dosage = dosageError;
  
  const frequencyError = validateRequired(data.frequency, "التكرار");
  if (frequencyError) errors.frequency = frequencyError;
  
  const durationError = validateRequired(data.duration, "المدة");
  if (durationError) errors.duration = durationError;
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Validate medical report data
 */
export const validateMedicalReportData = (data: any): ValidationResult => {
  const errors: Record<string, string> = {};
  
  const diagnosisError = validateRequired(data.diagnosis, "التشخيص");
  if (diagnosisError) errors.diagnosis = diagnosisError;
  
  const treatmentError = validateRequired(data.recommendedTreatment, "العلاج الموصى به");
  if (treatmentError) errors.recommendedTreatment = treatmentError;
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Validate operation sheet data
 */
export const validateOperationSheetData = (data: any): ValidationResult => {
  const errors: Record<string, string> = {};
  
  const surgeryTypeError = validateRequired(data.surgeryType, "نوع العملية");
  if (surgeryTypeError) errors.surgeryType = surgeryTypeError;
  
  const surgeryDateError = validateDate(data.surgeryDate, "تاريخ العملية");
  if (surgeryDateError) errors.surgeryDate = surgeryDateError;
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Get error message for a field
 */
export const getErrorMessage = (errors: Record<string, string>, fieldName: string): string | null => {
  return errors[fieldName] || null;
};

/**
 * Check if field has error
 */
export const hasError = (errors: Record<string, string>, fieldName: string): boolean => {
  return !!errors[fieldName];
};
