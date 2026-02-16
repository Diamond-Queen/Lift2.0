/**
 * OCR.Space API Proxy
 * Proxies OCR requests to OCR.Space server-side to avoid CORS issues
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { base64Image, filename = 'image.jpg' } = req.body;

    if (!base64Image) {
      return res.status(400).json({ error: 'base64Image is required' });
    }

    // Create FormData for OCR.Space API
    const formData = new FormData();
    formData.append('filename', filename);
    formData.append('isOverlayRequired', false);
    formData.append('apikey', 'K87899142372222'); // OCR.Space free tier key
    formData.append('language', 'eng');
    formData.append('base64Image', base64Image);

    // Call OCR.Space server-side (no CORS issues)
    const ocrRes = await fetch('https://api.ocr.space/parse', {
      method: 'POST',
      body: formData,
    });

    if (!ocrRes.ok) {
      return res.status(ocrRes.status).json({
        error: 'OCR.Space API error: ' + ocrRes.statusText,
      });
    }

    const ocrData = await ocrRes.json();

    if (ocrData.IsErroredOnProcessing) {
      return res.status(400).json({
        error: ocrData.ErrorMessage || 'OCR.Space processing failed',
      });
    }

    // Return the parsed text
    return res.status(200).json({
      ParsedText: ocrData.ParsedText || '',
      Confidence: ocrData.Confidence,
    });
  } catch (error) {
    console.error('[OCR API] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
