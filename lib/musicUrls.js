// Centralized music URL configuration for study mode
// Uses YouTube videos via backend stream extraction
// Each music type uses a YouTube video optimized for that genre

// Local music files from FreeSound (downloaded to /public/music/)
// Name your files: lofi.mp3, classical.mp3, ambient.mp3, rain.mp3, rap.mp3, rnb.mp3
// Falls back to YouTube if local file not found

export const musicUrls = {
  lofi: {
    primary: '/music/lofi.mp3',
    fallback: 'https://www.youtube.com/watch?v=z0GKGpObgPY'
  },
  classical: {
    primary: '/music/classical.mp3',
    fallback: 'https://www.youtube.com/watch?v=jgpJRI5i-Uc'
  },
  ambient: {
    primary: '/music/ambient.mp3',
    fallback: 'https://www.youtube.com/watch?v=lFcSrYw-ARY'
  },
  rain: {
    primary: '/music/rain.mp3',
    fallback: 'https://www.youtube.com/watch?v=mPZkdNFkNps'
  },
  rap: {
    primary: '/music/rap.mp3',
    fallback: 'https://www.youtube.com/watch?v=DXvMT_mVbqw'
  },
  rnb: {
    primary: '/music/rnb.mp3',
    fallback: 'https://www.youtube.com/watch?v=xWFqJRLBBLw'
  }
};

/**
 * Gets the audio stream URL for playback
 * - For local files (/music/*.mp3), returns as-is with caching
 * - For YouTube URLs, extracts stream via backend API with caching
 * @param {string} url - Local path or YouTube URL
 * @returns {Promise<string>} Stream URL for playback
 */
export const getAudioStreamUrl = async (url) => {
  if (!url) return null;

  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

  // For local files, return path directly (browser will fetch from /public)
  if (!isYouTube) {
    try {
      const cacheKey = `audio_stream_${url}`;
      const cached = localStorage?.getItem(cacheKey);
      if (cached) {
        const { streamUrl, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          return streamUrl;
        }
      }
      if (localStorage) {
        localStorage.setItem(cacheKey, JSON.stringify({ streamUrl: url, timestamp: Date.now() }));
      }
    } catch (err) {
      console.error('[Audio] Failed to cache local file path:', err.message);
    }
    return url;
  }

  try {
    // Try cache first (5 minute TTL)
    const cacheKey = `audio_stream_${url}`;
    const cached = localStorage?.getItem(cacheKey);
    
    if (cached) {
      const { streamUrl, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 5 * 60 * 1000) { // 5 minutes
        return streamUrl;
      }
    }

    // Fetch stream URL from backend for YouTube
    const response = await fetch(`/api/audio/stream?url=${encodeURIComponent(url)}`);
    
    if (!response.ok) {
      console.error('[Audio] Stream extraction failed:', response.status);
      return null;
    }

    const { streamUrl } = await response.json();
    
    // Cache the result
    if (localStorage && streamUrl) {
      localStorage.setItem(cacheKey, JSON.stringify({
        streamUrl,
        timestamp: Date.now()
      }));
    }

    return streamUrl;

  } catch (error) {
    console.error('[Audio] Failed to get stream URL:', error.message);
    return null;
  }
};

export const createAudioErrorHandler = (musicType, setError, musicUrls) => {
  let usedFallback = false;
  const audioElement = document.querySelector('audio') || (typeof window !== 'undefined' && window.audioRef?.current);
  
  return {
    handleError: () => {
      if (!usedFallback && musicUrls[musicType]?.fallback) {
        console.warn(`[Audio] Primary source failed, attempting fallback: ${musicType}`);
        usedFallback = true;
        if (audioElement) {
          audioElement.src = musicUrls[musicType].fallback;
          audioElement.load();
          audioElement.play().catch((err) => {
            console.error('[Audio] Fallback also failed:', err.message);
            setError && setError(`⚠ Unable to play ${musicType} music. Try another track.`);
          });
        }
      } else {
        console.error(`[Audio] Both primary and fallback failed: ${musicType}`);
        setError && setError(`⚠ Unable to load ${musicType} music. Check your connection.`);
      }
    },
    resetFallback: () => {
      usedFallback = false;
    }
  };
};
