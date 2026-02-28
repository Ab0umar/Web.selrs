import * as XLSX from "xlsx";

/**
 * Export data to Excel
 */
export const exportToExcel = (
  data: any[],
  fileName: string,
  sheetName: string = "Sheet1"
) => {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
    return true;
  } catch (error) {
    console.error("Error exporting to Excel:", error);
    return false;
  }
};

/**
 * Export patients to Excel
 */
export const exportPatientsToExcel = (patients: any[]) => {
  const data = patients.map((p) => ({
    "اسم المريض": p.patientName || p.fullName,
    "رقم الملف": p.patientCode,
    "الهاتف": p.phone,
    "البريد الإلكتروني": p.email,
    "العمر": p.age,
    "تاريخ الميلاد": p.dateOfBirth,
    "العنوان": p.address,
    "التاريخ الطبي": p.medicalHistory,
  }));

  return exportToExcel(data, `المرضى_${new Date().toISOString().split("T")[0]}`, "المرضى");
};

/**
 * Export appointments to Excel
 */
export const exportAppointmentsToExcel = (appointments: any[]) => {
  const data = appointments.map((a) => ({
    "اسم المريض": a.patientName,
    "تاريخ الموعد": a.appointmentDate,
    "وقت الموعد": a.appointmentTime,
    "الطبيب": a.doctorName,
    "الحالة": a.status,
    "الملاحظات": a.notes,
  }));

  return exportToExcel(
    data,
    `المواعيد_${new Date().toISOString().split("T")[0]}`,
    "المواعيد"
  );
};

/**
 * Export prescriptions to Excel
 */
export const exportPrescriptionsToExcel = (prescriptions: any[]) => {
  const data = prescriptions.map((p) => ({
    "اسم المريض": p.patientName,
    "اسم الدواء": p.medicationName,
    "الجرعة": p.dosage,
    "التكرار": p.frequency,
    "المدة": p.duration,
    "التعليمات": p.instructions,
    "الملاحظات": p.notes,
    "التاريخ": p.prescriptionDate,
  }));

  return exportToExcel(
    data,
    `الروشات_${new Date().toISOString().split("T")[0]}`,
    "الروشات"
  );
};

/**
 * Export medical reports to Excel
 */
export const exportMedicalReportsToExcel = (reports: any[]) => {
  const data = reports.map((r) => ({
    "اسم المريض": r.patientName,
    "التشخيص": r.diagnosis,
    "الأعراض": r.symptoms,
    "العلاج الموصى به": r.recommendedTreatment,
    "الملاحظات": r.notes,
    "التاريخ": r.reportDate,
  }));

  return exportToExcel(
    data,
    `التقارير_${new Date().toISOString().split("T")[0]}`,
    "التقارير"
  );
};

/**
 * Export to CSV
 */
export const exportToCSV = (
  data: any[],
  fileName: string,
  sheetName: string = "Sheet1"
) => {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `${fileName}.csv`);
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    return true;
  } catch (error) {
    console.error("Error exporting to CSV:", error);
    return false;
  }
};

/**
 * Print data
 */
export const printData = (
  data: any[],
  title: string,
  columns: string[]
) => {
  const printWindow = window.open("", "", "height=400,width=800");
  if (!printWindow) return false;

  let html = `
    <html dir="rtl">
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { text-align: center; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #007bff; color: white; padding: 10px; text-align: right; }
          td { border: 1px solid #ddd; padding: 8px; text-align: right; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          @media print {
            body { margin: 0; }
            table { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>تاريخ الطباعة: ${new Date().toLocaleString("ar-EG")}</p>
        <table>
          <thead>
            <tr>
              ${columns.map((col) => `<th>${col}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
  `;

  data.forEach((row) => {
    html += "<tr>";
    columns.forEach((col) => {
      const value = row[col.replace(/\s+/g, "")] || "-";
      html += `<td>${value}</td>`;
    });
    html += "</tr>";
  });

  html += `
          </tbody>
        </table>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.print();

  return true;
};

/**
 * Generate PDF using browser print
 */
export const generatePDF = (
  element: HTMLElement,
  fileName: string
) => {
  try {
    const printWindow = window.open("", "", "height=600,width=800");
    if (!printWindow) return false;

    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>${fileName}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          ${element.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
    return true;
  } catch (error) {
    console.error("Error generating PDF:", error);
    return false;
  }
};

/**
 * Download file
 */
export const downloadFile = (content: string, fileName: string, mimeType: string = "text/plain") => {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error("Error downloading file:", error);
    return false;
  }
};

/**
 * Create template for importing patients
 */
export const createPatientImportTemplate = () => {
  const templateData = [
    {
      "اسم المريض": "أحمد محمد",
      "رقم الملف": "P001",
      "الهاتف": "01012345678",
      "البريد الإلكتروني": "ahmed@example.com",
      "العمر": "30",
      "تاريخ الميلاد": "1994-01-15",
      "العنوان": "القاهرة",
      "التاريخ الطبي": "لا يوجد",
    },
  ];

  return exportToExcel(
    templateData,
    "نموذج_استيراد_المرضى",
    "المرضى"
  );
};
