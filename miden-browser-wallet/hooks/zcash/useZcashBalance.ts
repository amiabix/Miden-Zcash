/**
 * React Hook: useZcashBalance
 * 
 * Copy this file to: miden-wallet/src/modules/zcash/hooks/useZcashBalance.ts
 */

import { useState, useEffect, useCallback } from 'react';
import type { Balance } from '@miden/zcash-integration/wallet';
import type { ZcashModule } from '@miden/zcash-integration/wallet';

export interface UseZcashBalanceReturn {
  transparent: Balance | null;
  shielded: Balance | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  total: {
    confirmed: number;
    unconfirmed: number;
    total: number;
  };
}

export function useZcashBalance(
  zcashModule: ZcashModule,
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

      if (tAddress && results[0]?.status === 'fulfilled') {
        setTransparent(results[0].value);
      } else if (tAddress && results[0]?.status === 'rejected') {
        throw results[0].reason;
      }

      if (zAddress) {
        const shieldedIndex = tAddress ? 1 : 0;
        const shieldedResult = results[shieldedIndex];
        if (shieldedResult?.status === 'fulfilled') {
          setShielded(shieldedResult.value);
        } else if (shieldedResult?.status === 'rejected') {
          console.warn('Failed to load shielded balance:', shieldedResult.reason);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [zcashModule, tAddress, zAddress]);

  useEffect(() => {
    if (tAddress || zAddress) {
      // Only load once on mount, don't auto-refresh
      // Auto-refresh was causing balance to reset to 0 on errors
      loadBalances();
      
      // Disabled auto-refresh interval to prevent balance from being overwritten
      // const interval = setInterval(loadBalances, 30000);
      // return () => clearInterval(interval);
    }
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

