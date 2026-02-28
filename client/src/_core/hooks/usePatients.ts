import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export interface Patient {
  id?: number;
  patientCode: string;
  fullName: string;
  dateOfBirth?: string;
  age?: number;
  gender?: 'male' | 'female';
  nationalId?: string;
  phone: string;
  alternatePhone?: string;
  address?: string;
  occupation?: string;
  referralSource?: string;
  branch?: 'examinations' | 'surgery';
  status?: string;
  lastVisit?: string;
  serviceType?: string;
}

export const usePatients = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get all patients
  const getPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/medical/patients', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('فشل في جلب المرضى');
      }

      const data = await response.json();
      setPatients(data || []);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في جلب المرضى';
      setError(message);
      toast.error(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new patient
  const createPatient = useCallback(async (patientData: Patient) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/medical/patients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patientData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'فشل في إضافة المريض');
      }

      const newPatient = await response.json();
      setPatients([...patients, newPatient]);
      toast.success('تم إضافة المريض بنجاح');
      return newPatient;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في إضافة المريض';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [patients]);

  // Update patient
  const updatePatient = useCallback(async (patientId: number, patientData: Partial<Patient>) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/medical/patients/${patientId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patientData),
      });

      if (!response.ok) {
        throw new Error('فشل في تحديث المريض');
      }

      const updatedPatient = await response.json();
      setPatients(patients.map(p => p.id === patientId ? updatedPatient : p));
      toast.success('تم تحديث المريض بنجاح');
      return updatedPatient;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في تحديث المريض';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [patients]);

  // Delete patient
  const deletePatient = useCallback(async (patientId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/medical/patients/${patientId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('فشل في حذف المريض');
      }

      setPatients(patients.filter(p => p.id !== patientId));
      toast.success('تم حذف المريض بنجاح');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في حذف المريض';
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [patients]);

  // Search patients
  const searchPatients = useCallback(async (searchTerm: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/medical/patients/search?q=${encodeURIComponent(searchTerm)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('فشل في البحث عن المرضى');
      }

      const data = await response.json();
      return data || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ في البحث';
      setError(message);
      toast.error(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    patients,
    loading,
    error,
    getPatients,
    createPatient,
    updatePatient,
    deletePatient,
    searchPatients,
  };
};
