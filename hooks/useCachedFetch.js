// hooks/useCachedFetch.js - Optimized fetch hook with client-side caching and deduplication

import { useState, useEffect, useRef } from 'react';

// In-memory cache for fetch results (client-side only)
const fetchCache = new Map();
const pendingRequests = new Map();

/**
 * Custom hook for optimized API fetching with:
 * - Response caching (configurable TTL)
 * - Request deduplication (prevents duplicate in-flight requests)
 * - Automatic cache invalidation
 */
export function useCachedFetch(url, options = {}) {
  const {
    cacheTTL = 5 * 60 * 1000,  // 5 minutes default
    skipCache = false,
    method = 'GET',
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cacheKeyRef = useRef(`${method}:${url}`);

  useEffect(() => {
    const cacheKey = cacheKeyRef.current;
    
    // Check if we have a pending request for this URL
    if (pendingRequests.has(cacheKey)) {
      // Wait for the in-flight request to complete
      pendingRequests.get(cacheKey).then(
        (result) => {
          setData(result);
          setLoading(false);
        },
        (err) => {
          setError(err);
          setLoading(false);
        }
      );
      return;
    }

    // Check cache first (unless skipped)
    if (!skipCache && fetchCache.has(cacheKey)) {
      const cached = fetchCache.get(cacheKey);
      if (cached.expiry > Date.now()) {
        setData(cached.data);
        setLoading(false);
        return;
      } else {
        // Cache expired, remove it
        fetchCache.delete(cacheKey);
      }
    }

    // Create fetch promise
    const fetchPromise = (async () => {
      try {
        const res = await fetch(url, { method });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const result = await res.json();
        
        // Cache the result
        fetchCache.set(cacheKey, {
          data: result,
          expiry: Date.now() + cacheTTL
        });
        
        // Auto-clear from cache after TTL
        setTimeout(() => fetchCache.delete(cacheKey), cacheTTL);
        
        return result;
      } catch (err) {
        throw err;
      }
    })();

    // Store the pending request
    pendingRequests.set(cacheKey, fetchPromise);

    // Resolve the promise
    fetchPromise.then(
      (result) => {
        setData(result);
        setError(null);
      },
      (err) => {
        setError(err);
      }
    ).finally(() => {
      setLoading(false);
      // Remove from pending once complete
      pendingRequests.delete(cacheKey);
    });

  }, [url, skipCache, cacheTTL, method]);

  // Invalidate cache manually if needed
  const invalidateCache = () => {
    fetchCache.delete(cacheKeyRef.current);
  };

  return { data, loading, error, invalidateCache };
}

/**
 * Batch multiple fetch requests with parallel execution
 * Returns results in same order as input URLs
 */
export async function batchFetch(urls, cacheTTL = 5 * 60 * 1000) {
  const results = await Promise.all(
    urls.map(async (url) => {
      const cacheKey = `GET:${url}`;
      
      // Check cache
      if (fetchCache.has(cacheKey)) {
        const cached = fetchCache.get(cacheKey);
        if (cached.expiry > Date.now()) {
          return cached.data;
        }
        fetchCache.delete(cacheKey);
      }
      
      // Check pending
      if (pendingRequests.has(cacheKey)) {
        return pendingRequests.get(cacheKey);
      }
      
      // Fetch
      const fetchPromise = (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        const data = await res.json();
        
        // Cache result
        fetchCache.set(cacheKey, {
          data,
          expiry: Date.now() + cacheTTL
        });
        
        return data;
      })();

      pendingRequests.set(cacheKey, fetchPromise);
      return fetchPromise;
    })
  );

  // Clean up pending requests
  urls.forEach(url => {
    pendingRequests.delete(`GET:${url}`);
  });

  return results;
}

/**
 * Clear all fetch cache (useful for page refresh/logout)
 */
export function clearFetchCache() {
  fetchCache.clear();
  pendingRequests.clear();
}
