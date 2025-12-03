/**
 * React Hook: useZcashBalance
 * 
 * Hook for fetching and managing Zcash balance state
 */

/**
 * This file requires React to be installed.
 * Copy this file to your Miden wallet project where React is available.
 */

// @ts-ignore - React types may not be available in SDK build
import { useState, useEffect, useCallback } from 'react';
import type { Balance } from '../../types/index';

/**
 * Hook return type
 */
export interface UseZcashBalanceReturn {
  /** Transparent balance */
  transparent: Balance | null;
  
  /** Shielded balance */
  shielded: Balance | null;
  
  /** Loading state */
  loading: boolean;
  
  /** Error state */
  error: Error | null;
  
  /** Refresh balances */
  refresh: () => Promise<void>;
  
  /** Total balance (transparent + shielded) */
  total: {
    confirmed: number;
    unconfirmed: number;
    total: number;
  };
}

/**
 * Hook for managing Zcash balances
 * 
 * @param zcashModule - Zcash module instance
 * @param tAddress - Transparent address (optional)
 * @param zAddress - Shielded address (optional)
 */
export function useZcashBalance(
  zcashModule: any, // ZcashModule type
  tAddress?: string | null,
  zAddress?: string | null
): UseZcashBalanceReturn {
  const [transparent, setTransparent] = useState<Balance | null>(null);
  const [shielded, setShielded] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadBalances = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const promises: Promise<Balance>[] = [];

      if (tAddress) {
        promises.push(zcashModule.getBalance(tAddress, 'transparent'));
      }

      if (zAddress) {
        promises.push(zcashModule.getBalance(zAddress, 'shielded'));
      }

      const results = await Promise.allSettled(promises);

      if (tAddress && results[0].status === 'fulfilled') {
        setTransparent(results[0].value);
      } else if (tAddress && results[0].status === 'rejected') {
        throw results[0].reason;
      }

      if (zAddress) {
        const shieldedIndex = tAddress ? 1 : 0;
        const shieldedResult = results[shieldedIndex];
        if (shieldedResult?.status === 'fulfilled') {
          setShielded(shieldedResult.value);
        } else if (shieldedResult?.status === 'rejected') {
          // Error is silently handled to allow wallet to function without shielded balance
        }
      }
      
      return; // Explicit return for TypeScript
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [zcashModule, tAddress, zAddress]);

  useEffect(() => {
    if (tAddress || zAddress) {
      loadBalances();
      
      // Refresh every 30 seconds
      const interval = setInterval(loadBalances, 30000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [loadBalances, tAddress, zAddress]);

  const total = {
    confirmed: (transparent?.confirmed || 0) + (shielded?.confirmed || 0),
    unconfirmed: (transparent?.unconfirmed || 0) + (shielded?.unconfirmed || 0),
    total: (transparent?.total || 0) + (shielded?.total || 0)
  };

  return {
    transparent,
    shielded,
    loading,
    error,
    refresh: loadBalances,
    total
  };
}

