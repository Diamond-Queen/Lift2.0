import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/authOptions';
import vision from '@google-cloud/vision';
import path from 'path';
import fs from 'fs';

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

    const { buffer } = req.body;
    
    if (!buffer) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    try {
      let client;

      // Try to use environment variable first (Vercel production)
      if (process.env.GOOGLE_CLOUD_VISION_KEY) {
        try {
          const credentials = JSON.parse(process.env.GOOGLE_CLOUD_VISION_KEY);
          client = new vision.ImageAnnotatorClient({ credentials });
        } catch (err) {
          console.error('[Vision] Failed to parse GOOGLE_CLOUD_VISION_KEY:', err.message);
          throw err;
        }
      } else {
        // Fall back to file-based credentials (local development)
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'google-cloud-vision-key.json';
        const fullPath = path.resolve(credentialsPath);

        if (!fs.existsSync(fullPath)) {
          throw new Error(`Credentials file not found: ${fullPath}. Set GOOGLE_CLOUD_VISION_KEY environment variable or ensure google-cloud-vision-key.json exists.`);
        }

        client = new vision.ImageAnnotatorClient({ keyFilename: fullPath });
      }

      // Convert base64 string to Buffer if needed
      let imageBuffer = buffer;
      if (typeof buffer === 'string') {
        imageBuffer = Buffer.from(buffer, 'base64');
      }

      // Prepare request for Google Cloud Vision
      const request = {
        image: {
          content: imageBuffer,
        },
        features: [
          {
            type: 'TEXT_DETECTION', // Detect all text in image
          },
        ],
      };

      // Call Google Cloud Vision API
      const [result] = await client.annotateImage(request);
      const textAnnotations = result.textAnnotations || [];

      if (textAnnotations.length === 0) {
        return res.status(400).json({ error: 'No text could be extracted from the image' });
      }

      // The first text annotation contains all text from the image
      const extractedText = textAnnotations[0].description.trim();

      if (!extractedText) {
        return res.status(400).json({ error: 'No text could be extracted from the image' });
      }

      return res.status(200).json({
        success: true,
        text: extractedText,
        confidence: textAnnotations[0].confidence || 0.9,
      });
    } catch (err) {
      console.error('[Vision API] Error:', err);
      throw err;
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
