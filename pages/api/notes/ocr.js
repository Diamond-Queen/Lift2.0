import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/authOptions';
import Tesseract from 'tesseract.js';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check authentication
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Parse multipart form data
    const { buffer, filename } = req.body;
    
    if (!buffer) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    // Convert base64 to buffer if needed
    let imageBuffer = buffer;
    if (typeof buffer === 'string') {
      imageBuffer = Buffer.from(buffer, 'base64');
    }

    // Write to temporary file (Tesseract works better with files on disk)
    const tempFile = join(tmpdir(), `ocr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`);
    writeFileSync(tempFile, imageBuffer);

    try {
      // Run OCR on the server (much faster than client-side)
      const result = await Tesseract.recognize(tempFile, 'eng', {
        logger: (m) => {
          console.log(`[OCR] ${m.status}: ${Math.round(m.progress * 100)}%`);
        },
      });

      const extractedText = result.data.text.trim();

      // Clean up temp file
      try {
        unlinkSync(tempFile);
      } catch (e) {
        console.warn('Failed to clean up temp file:', e);
      }

      if (!extractedText) {
        return res.status(400).json({ error: 'No text could be extracted from the image' });
      }

      return res.status(200).json({
        success: true,
        text: extractedText,
        confidence: result.data.confidence,
      });
    } catch (ocrErr) {
      // Clean up temp file on error
      try {
        unlinkSync(tempFile);
      } catch (e) {
        // ignore
      }
      throw ocrErr;
    }
  } catch (err) {
    console.error('[OCR API] Error:', err);
    return res.status(500).json({
      error: 'Failed to extract text from image',
      message: err.message,
    });
  }
}

// Enable streaming for large files
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};
