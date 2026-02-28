import { useEffect, useState, type ChangeEvent } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, PrinterIcon, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateLabel } from "@/lib/utils";

type OperationFormState = {
  patientName: string;
  dateOfBirth: string;
  age: string;
  address: string;
  phone: string;
  operationDate: string;
  operationType: string;
  eye: string;
  surgeon: string;
  assistants: string;
  anesthesia: string;
  diagnosis: string;
  indication: string;
  preOpVision: string;
  operationDetails: string;
  complications: string;
  implants: string;
  sutures: string;
  immediatePostOpVision: string;
  postOpComments: string;
  medications: string;
  followUpSchedule: string;
  doctorName: string;
  doctorSignature: string;
};

const initialState: OperationFormState = {
  patientName: "",
  dateOfBirth: "",
  age: "",
  address: "",
  phone: "",
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

export default function OperationSheet() {
  const { user } = useAuth();
  const [, params] = useRoute("/sheets/operation/:id");
  const [, setLocation] = useLocation();
  const patientId = params?.id;
  const [formData, setFormData] = useState<OperationFormState>(initialState);

  useEffect(() => {
    const name = String(user?.name ?? "").trim();
    if (!name) return;
    setFormData((prev) => ({ ...prev, doctorName: name, doctorSignature: name }));
  }, [user?.name]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    alert("Saved successfully");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 print:p-0 sheet-layout" dir="rtl">
      <main className="max-w-6xl mx-auto print:p-0">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={() => setLocation("/patients")}
              className="border-primary text-primary hover:bg-primary/10"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-primary">Operation Sheet</h1>
              <p className="text-sm text-gray-600">Patient #{patientId ?? "-"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => window.print()}
              className="text-primary-foreground border-primary-foreground hover:bg-primary/80"
            >
              <PrinterIcon className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button size="sm" type="button" onClick={handleSave} className="bg-primary hover:bg-primary/90">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </div>

        <div className="flex flex-nowrap items-center gap-2 mb-4 text-xs border rounded-lg px-2 py-1 bg-muted/30 overflow-x-auto">
          <div className="flex items-center gap-2">
            <span className="font-bold">Operation Date</span>
            <Input name="operationDate" type="date" value={formData.operationDate} onChange={handleChange} className="w-[150px]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold">Operation Type</span>
            <Input name="operationType" value={formData.operationType} onChange={handleChange} className="w-[170px]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold">Eye</span>
            <select name="eye" value={formData.eye} onChange={handleChange} className="px-2 py-1 rounded-md text-xs w-[140px]">
              <option value="">Select</option>
              <option value="OD">Right (OD)</option>
              <option value="OS">Left (OS)</option>
              <option value="OU">Both (OU)</option>
            </select>
          </div>
        </div>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-white border border-gray-200 print:hidden">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="preop">Pre-op</TabsTrigger>
            <TabsTrigger value="intraop">Intra-op</TabsTrigger>
            <TabsTrigger value="postop">Post-op</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <Card className="p-6 bg-white border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input name="patientName" value={formData.patientName} onChange={handleChange} placeholder="Patient name" />
                <Input name="phone" value={formData.phone} onChange={handleChange} placeholder="Phone" />
                <Input name="address" value={formData.address} onChange={handleChange} placeholder="Address" />
                <Input name="age" type="number" value={formData.age} onChange={handleChange} placeholder="Age" />
                <div>
                  <Input name="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={handleChange} />
                  <p className="text-xs text-muted-foreground mt-1">{formatDateLabel(formData.dateOfBirth)}</p>
                </div>
                <Input name="surgeon" value={formData.surgeon} onChange={handleChange} placeholder="Surgeon" />
                <Input name="assistants" value={formData.assistants} onChange={handleChange} placeholder="Assistants" />
                <Input name="anesthesia" value={formData.anesthesia} onChange={handleChange} placeholder="Anesthesia" />
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="preop" className="space-y-4">
            <Card className="p-6 bg-white border-gray-200 space-y-4">
              <Textarea name="diagnosis" value={formData.diagnosis} onChange={handleChange} placeholder="Diagnosis" />
              <Textarea name="indication" value={formData.indication} onChange={handleChange} placeholder="Indication" />
              <Input name="preOpVision" value={formData.preOpVision} onChange={handleChange} placeholder="Pre-op vision" />
            </Card>
          </TabsContent>

          <TabsContent value="intraop" className="space-y-4">
            <Card className="p-6 bg-white border-gray-200 space-y-4">
              <Textarea name="operationDetails" value={formData.operationDetails} onChange={handleChange} placeholder="Operation details" />
              <Textarea name="complications" value={formData.complications} onChange={handleChange} placeholder="Complications" />
              <Input name="implants" value={formData.implants} onChange={handleChange} placeholder="Implants" />
              <Input name="sutures" value={formData.sutures} onChange={handleChange} placeholder="Sutures" />
            </Card>
          </TabsContent>

          <TabsContent value="postop" className="space-y-4">
            <Card className="p-6 bg-white border-gray-200 space-y-4">
              <Input
                name="immediatePostOpVision"
                value={formData.immediatePostOpVision}
                onChange={handleChange}
                placeholder="Immediate post-op vision"
              />
              <Textarea name="postOpComments" value={formData.postOpComments} onChange={handleChange} placeholder="Post-op comments" />
              <Textarea name="medications" value={formData.medications} onChange={handleChange} placeholder="Medications" />
              <Textarea name="followUpSchedule" value={formData.followUpSchedule} onChange={handleChange} placeholder="Follow-up plan" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input name="doctorName" value={formData.doctorName} readOnly placeholder="Doctor" />
                <Input name="doctorSignature" value={formData.doctorSignature} readOnly placeholder="Signature" />
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

