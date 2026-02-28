import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

export interface ConsultantSheetData {
  patientId: number;
  visitId: number;
  diagnosis: string;
  clinicalOpinion?: string;
  recommendedTreatment?: string;
  surgeryType?: string;
  surgeryScheduledDate?: string;
  additionalNotes?: string;
  examinationData?: Record<string, any>;
}

export interface SpecialistSheetData {
  patientId: number;
  visitId: number;
  specialistOpinion: string;
  findings?: string;
  recommendations?: string;
  examinationData?: Record<string, any>;
}

export interface LasikExamSheetData {
  patientId: number;
  visitId: number;
  pentacamResults?: Record<string, any>;
  topographyResults?: Record<string, any>;
  recommendations?: string;
  examinationData?: Record<string, any>;
}

export interface OperationSheetData {
  patientId: number;
  surgeryType: string;
  surgeryDate: string;
  preOpUCVA_OD?: string;
  preOpUCVA_OS?: string;
  preOpBCVA_OD?: string;
  preOpBCVA_OS?: string;
  surgeryNotes?: string;
  doctorId?: number;
}

export interface ExternalOperationSheetData {
  patientId: number;
  externalFacility: string;
  surgeryType: string;
  surgeryDate: string;
  externalDoctorName?: string;
  results?: string;
  notes?: string;
}

export const useConsultantSheet = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createDoctorReportMutation = trpc.medical.createDoctorReport.useMutation({
    onSuccess: () => {
      toast.success('تم حفظ التقرير بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل في حفظ التقرير');
    },
  });

  const saveSheet = useCallback(async (data: ConsultantSheetData) => {
    setLoading(true);
    setError(null);
    try {
      await createDoctorReportMutation.mutateAsync(data as any);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في حفظ البيانات';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [createDoctorReportMutation]);

  return {
    loading: loading || createDoctorReportMutation.isPending,
    error,
    saveSheet,
  };
};

export const useSpecialistSheet = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createDoctorReportMutation = trpc.medical.createDoctorReport.useMutation({
    onSuccess: () => {
      toast.success('تم حفظ التقرير بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل في حفظ التقرير');
    },
  });

  const saveSheet = useCallback(async (data: SpecialistSheetData) => {
    setLoading(true);
    setError(null);
    try {
      await createDoctorReportMutation.mutateAsync({
        visitId: data.visitId,
        patientId: data.patientId,
        diagnosis: data.specialistOpinion,
        clinicalOpinion: data.findings,
        recommendedTreatment: data.recommendations,
      } as any);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في حفظ البيانات';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [createDoctorReportMutation]);

  return {
    loading: loading || createDoctorReportMutation.isPending,
    error,
    saveSheet,
  };
};

export const useLasikExamSheet = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPentacamMutation = trpc.medical.createPentacamResult.useMutation({
    onSuccess: () => {
      toast.success('تم حفظ نتائج الفحص بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل في حفظ النتائج');
    },
  });

  const saveSheet = useCallback(async (data: LasikExamSheetData) => {
    setLoading(true);
    setError(null);
    try {
      await createPentacamMutation.mutateAsync({
        visitId: data.visitId,
        patientId: data.patientId,
        ...data.pentacamResults,
        techniciansNotes: data.recommendations,
      } as any);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في حفظ البيانات';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [createPentacamMutation]);

  return {
    loading: loading || createPentacamMutation.isPending,
    error,
    saveSheet,
  };
};

export const useOperationSheet = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSurgeryMutation = trpc.medical.createSurgery.useMutation({
    onSuccess: () => {
      toast.success('تم حفظ بيانات العملية بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل في حفظ البيانات');
    },
  });

  const saveSheet = useCallback(async (data: OperationSheetData) => {
    setLoading(true);
    setError(null);
    try {
      await createSurgeryMutation.mutateAsync(data as any);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في حفظ البيانات';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [createSurgeryMutation]);

  return {
    loading: loading || createSurgeryMutation.isPending,
    error,
    saveSheet,
  };
};

export const useExternalOperationSheet = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSurgeryMutation = trpc.medical.createSurgery.useMutation({
    onSuccess: () => {
      toast.success('تم حفظ بيانات العملية الخارجية بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل في حفظ البيانات');
    },
  });

  const saveSheet = useCallback(async (data: ExternalOperationSheetData) => {
    setLoading(true);
    setError(null);
    try {
      await createSurgeryMutation.mutateAsync({
        patientId: data.patientId,
        surgeryType: data.surgeryType,
        surgeryDate: data.surgeryDate,
        surgeryNotes: `${data.externalFacility} - ${data.externalDoctorName} - ${data.results}`,
      } as any);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في حفظ البيانات';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [createSurgeryMutation]);

  return {
    loading: loading || createSurgeryMutation.isPending,
    error,
    saveSheet,
  };
};
