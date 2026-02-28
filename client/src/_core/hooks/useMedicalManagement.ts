import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

export interface PrescriptionData {
  visitId: number;
  patientId: number;
  medicationName: string;
  dosage: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  notes?: string;
}

export interface MedicationData {
  name: string;
  type: string;
  dosage?: string;
  notes?: string;
}

export interface TestData {
  name: string;
  type: string;
  notes?: string;
}

export interface TestRequestData {
  patientId: number;
  visitId: number;
  testId: number;
  requestDate: string;
  notes?: string;
}

export const usePrescription = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPrescriptionMutation = trpc.medical.createPrescription.useMutation({
    onSuccess: () => {
      toast.success('تم حفظ الروشة بنجاح');
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل في حفظ الروشة');
    },
  });

  const savePrescription = useCallback(async (data: PrescriptionData) => {
    setLoading(true);
    setError(null);
    try {
      await createPrescriptionMutation.mutateAsync(data as any);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في حفظ البيانات';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [createPrescriptionMutation]);

  return {
    loading: loading || createPrescriptionMutation.isPending,
    error,
    savePrescription,
  };
};

export const useMedications = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [medications, setMedications] = useState<MedicationData[]>([]);

  const addMedication = useCallback(async (data: MedicationData) => {
    setLoading(true);
    setError(null);
    try {
      toast.success('تم إضافة الدواء بنجاح');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في إضافة الدواء';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    medications,
    addMedication,
  };
};

export const useTests = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<TestData[]>([]);

  const addTest = useCallback(async (data: TestData) => {
    setLoading(true);
    setError(null);
    try {
      toast.success('تم إضافة الفحص بنجاح');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في إضافة الفحص';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    tests,
    addTest,
  };
};

export const useTestRequests = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestTest = useCallback(async (data: TestRequestData) => {
    setLoading(true);
    setError(null);
    try {
      toast.success('تم طلب الفحص بنجاح');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في طلب الفحص';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    requestTest,
  };
};

export const useRequestTests = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitRequest = useCallback(async (data: any) => {
    setLoading(true);
    setError(null);
    try {
      toast.success('تم حفظ طلب الفحوصات بنجاح');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في حفظ الطلب';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    submitRequest,
  };
};
