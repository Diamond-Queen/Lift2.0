/**
 * Export utility for downloading notes in various formats
 * Supports PDF, PPTX, DOCX, and TXT
 */

export async function exportToPdf(content, filename) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  doc.setFontSize(12);
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const maxWidth = pageWidth - 2 * margin;
  const lineHeight = 7;
  
  const lines = doc.splitTextToSize(content, maxWidth);
  let yPosition = margin;
  
  lines.forEach((line, index) => {
    if (yPosition + lineHeight > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }
    doc.text(line, margin, yPosition);
    yPosition += lineHeight;
  });
  
  doc.save(`${filename}.pdf`);
}

export async function exportToPptx(content, filename) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  
  const maxCharsPerSlide = 1500;
  const slides = [];
  let currentSlide = '';
  
  const lines = content.split('\n');
  for (const line of lines) {
    if ((currentSlide + line).length > maxCharsPerSlide) {
      slides.push(currentSlide);
      currentSlide = line + '\n';
    } else {
      currentSlide += line + '\n';
    }
  }
  if (currentSlide.trim()) slides.push(currentSlide);
  
  slides.forEach((slideContent) => {
    const slide = pptx.addSlide();
    slide.addText(slideContent, { 
      x: 0.5, 
      y: 0.5, 
      w: 9, 
      h: 6, 
      fontSize: 12,
      valign: 'top',
      wrap: true
    });
  });
  
  pptx.writeFile({ fileName: `${filename}.pptx` });
}

export async function exportToDocx(content, filename) {
  const { Document, Packer, Paragraph } = await import('docx');
  const doc = new Document({
    sections: [{
      children: content.split('\n').map(line => new Paragraph({
        text: line,
        size: 24  // 12pt = 24 half-points in docx
      }))
    }]
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToTxt(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
