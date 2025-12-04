"use client";

/**
 * Zcash Provider
 * 
 * Centralized state management for Zcash integration
 * Provides Zcash module, account, and balance state to all components
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ZcashModule } from '@miden/zcash-integration/wallet';
import type { DerivedZcashAccount } from '@miden/zcash-integration/wallet';
import { initializeZcash, getZcashModule, isZcashInitialized, isRPCConnected } from '@/lib/zcash/zcashService';
import type { ZcashModuleState, ZcashAccountState, ZcashBalanceState } from '@/types/zcash';

interface ZcashContextType {
  // Module state
  module: ZcashModule | null;
  isInitialized: boolean;
  isRPCConnected: boolean;
  error: string | null;
  network: 'mainnet' | 'testnet';
  rpcEndpoint: string;

  // Account state
  account: DerivedZcashAccount | null;
  accountLoading: boolean;
  accountError: Error | null;
  addresses: {
    tAddress: string | null;
    zAddress: string | null;
  };

  // Balance state
  transparentBalance: {
    confirmed: number;
    unconfirmed: number;
    total: number;
    pending: number;
    unit: 'zatoshi' | 'ZEC';
  } | null;
  shieldedBalance: {
    confirmed: number;
    unconfirmed: number;
    total: number;
    pending: number;
    unit: 'zatoshi' | 'ZEC';
  } | null;
  balanceLoading: boolean;
  balanceError: Error | null;

  // Actions
  refreshAccount: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  refreshRPCStatus: () => Promise<boolean>;
  initialize: () => Promise<void>;
}

const ZcashContext = createContext<ZcashContextType | null>(null);

export function ZcashProvider({ children }: { children: React.ReactNode }) {
  // Module state
  const [module, setModule] = useState<ZcashModule | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRPCConnected, setIsRPCConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState<'mainnet' | 'testnet'>('testnet');
  const [rpcEndpoint, setRpcEndpoint] = useState<string>('');

  // Account state
  const [account, setAccount] = useState<DerivedZcashAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<Error | null>(null);

  // Balance state
  const [transparentBalance, setTransparentBalance] = useState<ZcashBalanceState['transparent']>(null);
  const [shieldedBalance, setShieldedBalance] = useState<ZcashBalanceState['shielded']>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<Error | null>(null);

  const initRef = useRef(false);
  const balanceIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Refresh account
   */
  const refreshAccount = useCallback(async (zcashModule?: ZcashModule) => {
    const moduleToUse = zcashModule || module;
    if (!moduleToUse) {
      return;
    }

    try {
      setAccountLoading(true);
      setAccountError(null);

      const zcashAccount = await moduleToUse.getActiveZcashAccount();
      setAccount(zcashAccount);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setAccountError(error);
      setAccount(null);
    } finally {
      setAccountLoading(false);
    }
  }, [module]);

  /**
   * Refresh balance
   */
  const refreshBalance = useCallback(async () => {
    if (!module || !account) {
      setBalanceLoading(false);
      return;
    }

    try {
      setBalanceLoading(true);
      setBalanceError(null);

      // Add timeout to prevent infinite loading (increased to 20 seconds for slow networks)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Balance fetch timeout')), 20000)
      );

      const balancePromise = (async () => {
        // Fetch transparent balance
        if (account.tAddress) {
          try {
            console.log('[ZcashProvider] Fetching transparent balance for:', account.tAddress);
            const tBalance = await module.getBalance(account.tAddress, 'transparent');
            console.log('[ZcashProvider] Transparent balance received:', tBalance);
            // Only update if we got a valid balance (don't overwrite with 0 on error)
            if (tBalance && tBalance.total >= 0) {
              setTransparentBalance(tBalance);
              console.log('[ZcashProvider] Transparent balance set to:', tBalance.total, 'zatoshi');
            } else if (tBalance && tBalance.total === 0) {
              // Only set to 0 if API explicitly returns 0 (not on error)
              setTransparentBalance(tBalance);
              console.log('[ZcashProvider] Transparent balance is 0 (confirmed by API)');
            }
            // If error, don't update balance at all - keep existing value
          } catch (tErr: any) {
            const isTimeout = tErr?.message?.includes('timeout') || tErr?.message?.includes('Timeout');
            if (isTimeout) {
              console.warn('[ZcashProvider] Transparent balance fetch timeout - keeping existing balance');
            } else {
              console.error('[ZcashProvider] Failed to fetch transparent balance:', tErr);
            }
            // Don't set balance to 0 on error - keep existing balance
            // This prevents background sync from overwriting valid balances
          }
        } else {
          console.warn('[ZcashProvider] No transparent address available for balance fetch');
        }

        // Fetch shielded balance
        if (account.zAddress) {
          try {
            const zBalance = await module.getBalance(account.zAddress, 'shielded');
            // Only update if we got a valid balance (don't overwrite with 0 on error)
            if (zBalance && zBalance.total >= 0) {
              setShieldedBalance(zBalance);
            } else if (zBalance && zBalance.total === 0) {
              // Only set to 0 if API explicitly returns 0 (not on error)
              setShieldedBalance(zBalance);
            }
            // If error, don't update balance at all - keep existing value
          } catch (zErr: any) {
            const isTimeout = zErr?.message?.includes('timeout') || zErr?.message?.includes('Timeout');
            if (isTimeout) {
              console.warn('Shielded balance fetch timeout - keeping existing balance');
            } else {
              console.error('Failed to fetch shielded balance:', zErr);
            }
            // Don't set balance to 0 on error - keep existing balance
          }
        }
      })();

      await Promise.race([balancePromise, timeoutPromise]);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const isTimeout = error.message.includes('timeout') || error.message.includes('Timeout');
      
      if (isTimeout) {
        console.warn('Balance fetch timeout - keeping existing balance');
        // On timeout, don't log as error - just keep existing balance
        // Don't set balanceError for timeouts to avoid UI confusion
      } else {
        console.error('Balance refresh error:', error);
        setBalanceError(error);
      }
      
      // NEVER set balance to 0 on error/timeout - always keep existing balance
      // Don't set balance to 0 on error - keep existing balance or leave as null
      // This prevents showing "0" when balance hasn't been fetched yet
      // The UI will show "No balance loaded" if balance is null, which is better than showing "0"
    } finally {
      setBalanceLoading(false);
    }
  }, [module, account, transparentBalance, shieldedBalance]);

  /**
   * Initialize Zcash module
   */
  const initialize = useCallback(async () => {
    if (initRef.current || isInitialized) {
      return;
    }

    try {
      initRef.current = true;
      setError(null);

      // Wait for wallet to be ready - quick check only (non-blocking)
      if (typeof window !== 'undefined') {
        const store = (window as any).__MIDEN_SDK_STORE__;
        if (store) {
          // Quick check - only wait 2 seconds max
          let attempts = 0;
          const maxAttempts = 4; // 2 seconds max wait (500ms * 4)
          
          while (attempts < maxAttempts) {
            const state = store.getState();
            if (!state.isLoading) {
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
          }
          
          // Always proceed - don't block on wallet loading
          const finalState = store.getState();
          if (finalState.isLoading) {
            console.warn('Miden SDK still loading, proceeding with Zcash initialization (non-blocking)');
          }
        }
      }

      console.log('[ZcashProvider] Starting Zcash initialization...');
      // Add timeout to prevent hanging
      const initPromise = initializeZcash();
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Zcash initialization timeout after 30 seconds')), 30000)
      );
      
      const zcashModule = await Promise.race([initPromise, timeoutPromise]);
      console.log('[ZcashProvider] Zcash initialization successful');
      setModule(zcashModule);
      setIsInitialized(true);
      setNetwork(zcashModule.getNetwork());
      setRpcEndpoint(zcashModule.getRPCEndpoint());
      setIsRPCConnected(zcashModule.isRPCConnected());

      // Don't auto-load account - let user trigger it manually via "Load Addresses" button
      // This prevents showing the "Private key export required" message prematurely
      // refreshAccount(zcashModule).catch(err => {
      //   console.warn('Failed to load Zcash account (non-blocking):', err);
      // });

      // Start balance refresh interval (every 30 seconds)
      // Disable auto-refresh interval - let user manually refresh
      // Auto-refresh was causing balance to reset to 0 on errors
      // balanceIntervalRef.current = setInterval(() => {
      //   refreshBalance();
      // }, 30000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[ZcashProvider] Initialization failed:', err);
      setError(errorMsg);
      setIsInitialized(false);
      initRef.current = false;
      // Even on error, allow the page to render so user can see the error
      // This prevents the page from being stuck in loading state
    }
  }, [isInitialized, refreshAccount, refreshBalance]);

  /**
   * Refresh RPC connection status
   */
  const refreshRPCStatus = useCallback(async (): Promise<boolean> => {
    if (!module) {
      return false;
    }

    try {
      const connected = await module.refreshRPCConnection();
      setIsRPCConnected(connected);
      return connected;
    } catch {
      setIsRPCConnected(false);
      return false;
    }
  }, [module]);

  // Initialize on mount - non-blocking
  useEffect(() => {
    // Wait for Miden SDK to be ready before initializing Zcash
    const checkAndInitialize = async () => {
      // Check if already initialized
      if (isZcashInitialized()) {
        const existingModule = getZcashModule();
        setModule(existingModule);
        setIsInitialized(true);
        setNetwork(existingModule.getNetwork());
        setRpcEndpoint(existingModule.getRPCEndpoint());
        setIsRPCConnected(existingModule.isRPCConnected());
        // Don't auto-load account - let user trigger it manually
        // refreshAccount(existingModule);
        return;
      }

      // Initialize immediately (non-blocking) - don't wait for wallet
      // The initialization function will handle wallet readiness internally
      initialize().catch((err) => {
        console.error('Zcash initialization error:', err);
        // Only set error for critical failures, not timeouts or initialization delays
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (!errorMsg.includes('Timeout') && 
            !errorMsg.includes('still initializing') &&
            !errorMsg.includes('recursive use')) {
          setError(errorMsg);
        }
      });
    };

    checkAndInitialize();

    // Cleanup
    return () => {
      if (balanceIntervalRef.current) {
        clearInterval(balanceIntervalRef.current);
      }
    };
  }, [initialize, isInitialized]);

  // Subscribe to account changes
  useEffect(() => {
    if (!module) {
      return;
    }

    const unsubscribe = module.onAccountChange((newAccount) => {
      setAccount(newAccount);
      // Only refresh balance if account actually changed (not on every event)
      // Don't auto-refresh to avoid overwriting valid balances
      // User can manually refresh if needed
    });

    return () => {
      unsubscribe();
    };
  }, [module]);

  // Refresh balance when account changes (but only once, not on every render)
  // Use ref to track if we've already loaded balance for these addresses
  const balanceLoadedRef = useRef<{ tAddress?: string; zAddress?: string }>({});
  
  useEffect(() => {
    if (account && (account.tAddress || account.zAddress)) {
      const currentTAddress = account.tAddress || undefined;
      const currentZAddress = account.zAddress || undefined;
      const loadedTAddress = balanceLoadedRef.current.tAddress;
      const loadedZAddress = balanceLoadedRef.current.zAddress;
      
      // Only refresh if addresses actually changed (not just on every render)
      const addressesChanged = 
        currentTAddress !== loadedTAddress || 
        currentZAddress !== loadedZAddress;
      
      // Only auto-refresh if addresses changed AND we don't have a balance yet
      if (addressesChanged && !balanceLoading) {
        if ((!transparentBalance && currentTAddress) || (!shieldedBalance && currentZAddress)) {
          balanceLoadedRef.current = { tAddress: currentTAddress, zAddress: currentZAddress };
          refreshBalance();
        } else if (addressesChanged) {
          // Addresses changed but we have balance - just update the ref
          balanceLoadedRef.current = { tAddress: currentTAddress, zAddress: currentZAddress };
        }
      }
    }
  }, [account?.tAddress, account?.zAddress, transparentBalance, shieldedBalance, balanceLoading, refreshBalance]);

  const value: ZcashContextType = {
    // Module state
    module,
    isInitialized,
    isRPCConnected,
    error,
    network,
    rpcEndpoint,

    // Account state
    account,
    accountLoading,
    accountError,
    addresses: {
      tAddress: account?.tAddress || null,
      zAddress: account?.zAddress || null
    },

    // Balance state
    transparentBalance,
    shieldedBalance,
    balanceLoading,
    balanceError,

    // Actions
    refreshAccount,
    refreshBalance,
    refreshRPCStatus,
    initialize
  };

  return (
    <ZcashContext.Provider value={value}>
      {children}
    </ZcashContext.Provider>
  );
}

/**
 * Hook to use Zcash context
 */
export function useZcash() {
  const context = useContext(ZcashContext);
  if (!context) {
    throw new Error('useZcash must be used within ZcashProvider');
  }
  return context;
}

