/**
 * Export utility for downloading notes in various formats
 * Supports PDF, PPTX, DOCX, and TXT
 */

export async function exportToPdf(content, filename) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const lines = doc.splitTextToSize(content, 180);
  doc.text(lines, 10, 10);
  doc.save(`${filename}.pdf`);
}

export async function exportToPptx(content, filename) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();
  slide.addText(content, { x: 0.5, y: 0.5, w: 9, h: 6, fontSize: 14 });
  pptx.writeFile({ fileName: `${filename}.pptx` });
}

export async function exportToDocx(content, filename) {
  const { Document, Packer, Paragraph } = await import('docx');
  const doc = new Document({
    sections: [{
      children: content.split('\n').map(line => new Paragraph(line))
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
