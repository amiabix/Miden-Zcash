/**
 * React Hook: useZcashAccount
 * 
 * Hook for managing Zcash account state in React components
 */

// React hooks - these are optional and only work in React environments
// If React is not available, these will fail at runtime
// Wallet developers should copy these hooks to their React project
let useState: <T>(initial: T) => [T, (value: T) => void];
let useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
let useCallback: <T extends (...args: any[]) => any>(fn: T, deps?: any[]) => T;
try {
  const react = require('react');
  useState = react.useState;
  useEffect = react.useEffect;
  useCallback = react.useCallback;
} catch {
  // React not available - hooks won't work
  useState = <T>(initial: T) => [initial, () => {}] as [T, (value: T) => void];
  useEffect = () => {};
  useCallback = <T extends (...args: any[]) => any>(fn: T) => fn;
}
import type { DerivedZcashAccount } from '../midenKeyBridge';
import type { ZcashModule } from '../integration';

/**
 * Hook return type
 */
export interface UseZcashAccountReturn {
  /** Current Zcash account */
  account: DerivedZcashAccount | null;
  
  /** Loading state */
  loading: boolean;
  
  /** Error state */
  error: Error | null;
  
  /** Refresh account */
  refresh: () => Promise<void>;
  
  /** Zcash addresses */
  addresses: {
    tAddress: string | null;
    zAddress: string | null;
  };
}

/**
 * Hook for managing Zcash account
 * 
 * @param zcashModule - Zcash module instance
 * @param midenAccountId - Miden account ID (optional, uses active account if not provided)
 */
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

    // Subscribe to account changes
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

