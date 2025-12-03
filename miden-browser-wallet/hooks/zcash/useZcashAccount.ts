/**
 * React Hook: useZcashAccount
 * 
 * Copy this file to: miden-wallet/src/modules/zcash/hooks/useZcashAccount.ts
 */

import { useState, useEffect, useCallback } from 'react';
import type { DerivedZcashAccount } from '@miden/zcash-integration/wallet';
import type { ZcashModule } from '@miden/zcash-integration/wallet';

export interface UseZcashAccountReturn {
  account: DerivedZcashAccount | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  addresses: {
    tAddress: string | null;
    zAddress: string | null;
  };
}

export function useZcashAccount(
  zcashModule: ZcashModule,
  midenAccountId?: string
): UseZcashAccountReturn {
  const [account, setAccount] = useState<DerivedZcashAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadAccount = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const zcashAccount = midenAccountId
        ? await zcashModule.getKeyBridge().deriveZcashAccount(midenAccountId)
        : await zcashModule.getActiveZcashAccount();

      setAccount(zcashAccount);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [zcashModule, midenAccountId]);

  useEffect(() => {
    loadAccount();

    const unsubscribe = zcashModule.onAccountChange((newAccount) => {
      setAccount(newAccount);
    });

    return () => {
      unsubscribe();
    };
  }, [loadAccount, zcashModule]);

  return {
    account,
    loading,
    error,
    refresh: loadAccount,
    addresses: {
      tAddress: account?.tAddress || null,
      zAddress: account?.zAddress || null
    }
  };
}

