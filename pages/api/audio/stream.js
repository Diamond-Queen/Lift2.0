import { execSync } from 'child_process';

/**
 * API Route: /api/audio/stream
 * Extracts audio stream URL from YouTube video using yt-dlp
 * 
 * Query Parameters:
 *   - url: YouTube video URL (required)
 * 
 * Returns: { streamUrl: string } or error
 */

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  try {
    // Validate it's a YouTube URL
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Use yt-dlp to extract best audio stream URL
    // --js-runtimes node: use Node.js for JavaScript execution
    // -g: get URL without downloading
    // --no-warnings: suppress warnings
    const streamUrl = execSync(
      `/home/queen/.local/bin/yt-dlp --js-runtimes node -g --no-warnings "${url.replace(/"/g, '\\"')}"`,
      { 
        timeout: 15000, // 15 second timeout
        encoding: 'utf-8'
      }
    ).trim();

    if (!streamUrl) {
      return res.status(500).json({ error: 'Failed to extract stream URL' });
    }

    // Cache for 1 hour since YouTube stream URLs expire
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json({ streamUrl });

  } catch (error) {
    console.error('[Audio Stream] Error extracting from YouTube:', error.message);
    
    // Return appropriate error based on failure type
    if (error.message.includes('timeout')) {
      return res.status(408).json({ error: 'Request timeout - video took too long to process' });
    }
    
    if (error.message.includes('No video matches')) {
      return res.status(404).json({ error: 'Video not found or unavailable' });
    }

    return res.status(500).json({ 
      error: 'Failed to extract audio stream',
      details: error.message 
    });
  }
}
