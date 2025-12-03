/**
 * React Hook: useZcashInit
 * 
 * Handles Zcash module initialization
 * Separates initialization logic from component rendering
 */

import { useState, useEffect, useCallback } from 'react';
import { initializeZcash, isZcashInitialized, getZcashModule } from '@/lib/zcash/zcashService';
import type { ZcashModule } from '@miden/zcash-integration/wallet';

export interface UseZcashInitReturn {
  isReady: boolean;
  error: Error | null;
  module: ZcashModule | null;
  initialize: () => Promise<void>;
  retry: () => Promise<void>;
}

/**
 * Hook for initializing Zcash module
 * 
 * @param autoInit - Automatically initialize on mount (default: true)
 * @returns Initialization state and module instance
 */
export function useZcashInit(autoInit: boolean = true): UseZcashInitReturn {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [module, setModule] = useState<ZcashModule | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const initialize = useCallback(async () => {
    // Prevent concurrent initialization
    if (isInitializing) {
      return;
    }

    try {
      setIsInitializing(true);
      setError(null);

      // Check if already initialized
      if (isZcashInitialized()) {
        const existingModule = getZcashModule();
        setModule(existingModule);
        setIsReady(true);
        return;
      }

      // Wait for wallet to be ready
      if (typeof window !== 'undefined') {
        const store = (window as any).__MIDEN_SDK_STORE__;
        if (store) {
          const state = store.getState();
          if (state.isLoading) {
            // Wait for wallet initialization
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      // Initialize Zcash
      const zcashModule = await initializeZcash();
      setModule(zcashModule);
      setIsReady(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsReady(false);
      setModule(null);
    } finally {
      setIsInitializing(false);
    }
  }, [isInitializing]);

  const retry = useCallback(async () => {
    setError(null);
    await initialize();
  }, [initialize]);

  // Auto-initialize on mount if enabled
  useEffect(() => {
    if (autoInit && !isReady && !isInitializing) {
      initialize();
    }
  }, [autoInit, isReady, isInitializing, initialize]);

  return {
    isReady,
    error,
    module,
    initialize,
    retry
  };
}

