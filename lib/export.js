/**
 * Export utility for downloading content in various formats
 * Supports PDF, DOCX, TXT based on user preferences
 */

export async function exportContent(content, filename, format = 'txt') {
  switch (format) {
    case 'txt':
      exportAsText(content, filename);
      break;
    case 'pdf':
      await exportAsPDF(content, filename);
      break;
    case 'docx':
      exportAsDOCX(content, filename);
      break;
    default:
      exportAsText(content, filename);
  }
}

function exportAsText(content, filename) {
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

async function exportAsPDF(content, filename) {
  // Simple HTML-to-PDF conversion (requires jsPDF or similar)
  // For now, falling back to text - can be enhanced with jsPDF library
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    
    // Split content into lines that fit page width
    const lines = doc.splitTextToSize(content, 180);
    doc.text(lines, 15, 15);
    doc.save(`${filename}.pdf`);
  } catch (err) {
    console.warn('jsPDF not available, falling back to text export:', err);
    exportAsText(content, filename);
  }
}

function exportAsDOCX(content, filename) {
  // Simple DOCX export using HTML wrapper
  // For production, use docx.js library for proper formatting
  const htmlContent = `
    <html>
      <head>
        <meta charset="utf-8">
        <title>${filename}</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.6;">
        <pre style="white-space: pre-wrap; font-family: inherit;">${content}</pre>
      </body>
    </html>
  `;
  
  const blob = new Blob([htmlContent], { 
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.doc`; // Using .doc extension for compatibility
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Get user's preferred export format from preferences
 */
export async function getPreferredExportFormat() {
  try {
    const res = await fetch('/api/user/preferences');
    if (res.ok) {
      const data = await res.json();
      return data.data?.preferences?.exportFormat || 'txt';
    }
  } catch (err) {
    console.error('Failed to load export format preference:', err);
  }
  return 'txt';
}
