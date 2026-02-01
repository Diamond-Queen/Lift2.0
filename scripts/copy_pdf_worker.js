const fs = require('fs');
const path = require('path');

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Copied pdf.worker from ${src} to ${dest}`);
}

const dest = path.join(__dirname, '..', 'public', 'pdf.worker.min.mjs');

try {
  // Try resolving the exact file from the installed package
  const resolved = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
  copy(resolved, dest);
} catch (e) {
  try {
    // Fallback to expected location in node_modules
    const fallback = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
    if (fs.existsSync(fallback)) {
      copy(fallback, dest);
    } else {
      console.warn('pdf.worker not found in node_modules/pdfjs-dist/build. Please check pdfjs-dist installation.');
    }
  } catch (err) {
    console.warn('Failed to copy pdf.worker:', err);
  }
}
