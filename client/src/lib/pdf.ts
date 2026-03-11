function sanitizePdfFileName(fileName: string) {
  const stem = String(fileName ?? "").replace(/\.[^.]+$/, "");
  const safe = stem.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_").trim() || "download";
  return `${safe}.pdf`;
}

function buildSingleImagePdfBytes(jpegBytes: Uint8Array, width: number, height: number) {
  const pageWidth = Math.max(1, Math.round(width));
  const pageHeight = Math.max(1, Math.round(height));
  const contentStream = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects: Array<string | Uint8Array> = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    new TextEncoder().encode(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(width)} /Height ${Math.round(height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
    ),
    jpegBytes,
    new TextEncoder().encode(`\nendstream\nendobj\n`),
    `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`,
  ];

  const header = `%PDF-1.4\n%\xFF\xFF\xFF\xFF\n`;
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [encoder.encode(header)];
  const offsets: number[] = [0];
  let position = parts[0].length;

  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(position);
    const chunk = typeof objects[i] === "string" ? encoder.encode(objects[i] as string) : (objects[i] as Uint8Array);
    parts.push(chunk);
    position += chunk.length;
  }

  const xrefOffset = position;
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(encoder.encode(xref));
  parts.push(encoder.encode(trailer));

  const total = parts.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

export async function downloadImageAsPdf(imageUrl: string, fileName: string) {
  const img = new Image();
  img.decoding = "async";
  img.crossOrigin = "anonymous";
  const loadPromise = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not load image"));
  });
  img.src = imageUrl;
  await loadPromise;

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const jpegBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) jpegBytes[i] = binary.charCodeAt(i);

  const pdfBytes = buildSingleImagePdfBytes(jpegBytes, canvas.width, canvas.height);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = sanitizePdfFileName(fileName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
