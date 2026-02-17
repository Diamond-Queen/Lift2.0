import { useState, useCallback, useEffect } from 'react';

/**
 * useFirewallBlock
 * Tracks firewall blocks and provides state for displaying the FirewallBlock component
 * 
 * Usage:
 *   const { isBlocked, reason, blockUntil, recordBlock, clearBlock } = useFirewallBlock();
 * 
 *   // When an API call gets blocked:
 *   recordBlock(reason, blockDurationMs);
 * 
 *   // In your component:
 *   <FirewallBlock 
 *     isBlocked={isBlocked} 
 *     reason={reason} 
 *     blockUntil={blockUntil}
 *     onDismiss={clearBlock}
 *   />
 */
export function useFirewallBlock() {
  const [isBlocked, setIsBlocked] = useState(false);
  const [reason, setReason] = useState('');
  const [blockUntil, setBlockUntil] = useState(null);

  const recordBlock = useCallback((blockReason = 'rate_limit_exceeded', durationMs = 120000) => {
    const until = new Date(Date.now() + durationMs);
    setReason(blockReason);
    setBlockUntil(until.toISOString());
    setIsBlocked(true);

    // Log to console for debugging
    console.warn('[FIREWALL] IP blocked:', {
      reason: blockReason,
      durationMs,
      until: until.toISOString(),
    });

    // Auto-clear after duration expires
    setTimeout(() => {
      clearBlock();
    }, durationMs + 1000);
  }, []);

  const clearBlock = useCallback(() => {
    setIsBlocked(false);
    setReason('');
    setBlockUntil(null);
  }, []);

  // Detect firewall blocks from API responses
  const wrapApiCall = useCallback(async (apiCall) => {
    try {
      const response = await apiCall();
      
      // Check for firewall-related status codes
      if (response.status === 403) {
        const data = await response.json();
        recordBlock(data.reason || 'ip_blocked', 900000); // 15 min
        return { ok: false, error: 'blocked', data };
      }
      
      if (response.status === 429) {
        const data = await response.json();
        recordBlock('rate_limit_exceeded', 120000); // 2 min
        return { ok: false, error: 'rate_limited', data };
      }

      // For other 400 responses that might be security-related
      if (response.status === 400) {
        const data = await response.json();
        if (data.reason && (
          data.reason.includes('injection') || 
          data.reason.includes('xss') || 
          data.reason.includes('blocked') ||
          data.reason === 'suspicious_input'
        )) {
          recordBlock(data.reason || 'suspicious_activity', 60000); // 1 min
          return { ok: false, error: 'security_block', data };
        }
      }

      return response;
    } catch (error) {
      console.error('[FIREWALL-HOOK] API call error:', error);
      throw error;
    }
  }, [recordBlock]);

  return {
    isBlocked,
    reason,
    blockUntil,
    recordBlock,
    clearBlock,
    wrapApiCall,
  };
}
