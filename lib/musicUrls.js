// Centralized music URL configuration for study mode
// Each music type has a primary and fallback URL for reliability
// Cache-busting with timestamp to ensure fresh loads

export const musicUrls = {
  lofi: {
    primary: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3?v=1',
    fallback: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3?v=1'
  },
  classical: {
    primary: 'https://www.mfiles.co.uk/mp3-downloads/beethoven-symphony5-1.mp3?v=1',
    fallback: 'https://www.mfiles.co.uk/mp3-downloads/beethoven-moonlight-sonata.mp3?v=1'
  },
  ambient: {
    primary: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3?v=1',
    fallback: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3?v=1'
  },
  rain: {
    primary: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3?v=1',
    fallback: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3?v=1'
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
