// Centralized music URL configuration for study mode
// Uses YouTube videos via backend stream extraction
// Each music type uses a YouTube video optimized for that genre

export const musicUrls = {
  lofi: {
    primary: 'https://www.youtube.com/watch?v=z0GKGpObgPY', // Lofi Girl - beats to relax/study
    fallback: 'https://www.youtube.com/watch?v=lTRiuFIWV54' // Lofi Hip Hop Music
  },
  classical: {
    primary: 'https://www.youtube.com/watch?v=jgpJRI5i-Uc', // Classical Music for Studying
    fallback: 'https://www.youtube.com/watch?v=Rb6FKlfU-zk' // Mozart Classical Music
  },
  ambient: {
    primary: 'https://www.youtube.com/watch?v=lFcSrYw-ARY', // Ambient Music - Lounge
    fallback: 'https://www.youtube.com/watch?v=kgx4WGK0oNU' // Ambient Relaxation
  },
  rain: {
    primary: 'https://www.youtube.com/watch?v=mPZkdNFkNps', // Rain Sounds for Sleeping
    fallback: 'https://www.youtube.com/watch?v=q76bMs-NwRk' // Rain and Thunder Sounds
  },
  rap: {
    primary: 'https://www.youtube.com/watch?v=DXvMT_mVbqw', // Hip Hop Beats Instrumental
    fallback: 'https://www.youtube.com/watch?v=O2FhlP-pxx0' // Rap Beats - Chill Hip Hop
  },
  rnb: {
    primary: 'https://www.youtube.com/watch?v=xWFqJRLBBLw', // R&B Soul Mix
    fallback: 'https://www.youtube.com/watch?v=SZBhfMhaC-w' // R&B Music Playlist
  }
};

/**
 * Gets the audio stream URL for a YouTube video via the backend API
 * Caches results in localStorage to minimize API calls
 * @param {string} youtubeUrl - Full YouTube URL
 * @returns {Promise<string>} Stream URL for playback
 */
export const getAudioStreamUrl = async (youtubeUrl) => {
  if (!youtubeUrl) return null;

  try {
    // Try cache first (5 minute TTL)
    const cacheKey = `audio_stream_${youtubeUrl}`;
    const cached = localStorage?.getItem(cacheKey);
    
    if (cached) {
      const { streamUrl, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 5 * 60 * 1000) { // 5 minutes
        return streamUrl;
      }
    }

    // Fetch stream URL from backend
    const response = await fetch(`/api/audio/stream?url=${encodeURIComponent(youtubeUrl)}`);
    
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
