"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';
import { KeyExportDialog } from '@/components/zcash/KeyExportDialog';

interface KeyExportContextType {
  requestKeyExport: () => Promise<string | null>; // Returns password if provided, null if cancelled
}

const KeyExportContext = createContext<KeyExportContextType | null>(null);

export function KeyExportProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [resolvePromise, setResolvePromise] = useState<((value: string | null) => void) | null>(null);

  const requestKeyExport = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      // Check if account is already set up - skip dialog if so
      if (typeof window !== 'undefined') {
        // Check for specific account ID first
        const store = (window as any).__MIDEN_SDK_STORE__;
        let hasSetup = false;
        
        if (store) {
          const state = store.getState();
          if (state.account) {
            const accountId = state.account;
            const accountSetupKey = `zcash_account_setup_${accountId}`;
            hasSetup = localStorage.getItem(accountSetupKey) === 'true';
          }
        }
        
        // Fallback: check for general flag
        if (!hasSetup) {
          hasSetup = localStorage.getItem('zcash_account_setup_complete') === 'true' ||
                     Object.keys(localStorage).some(key => key.startsWith('zcash_account_setup_'));
        }
        
        if (hasSetup) {
          // Account already set up, return empty password immediately
          resolve('');
          return;
        }
      }
      
      // First time setup, show dialog
      setResolvePromise(() => resolve);
      setIsOpen(true);
    });
  }, []);

  const handleConfirm = useCallback((password: string) => {
    setIsOpen(false);
    
    // Save setup flag immediately after password confirmation
    // This ensures we don't ask for password again
    if (typeof window !== 'undefined') {
      try {
        // Get the active account ID to save the flag
        const store = (window as any).__MIDEN_SDK_STORE__;
        if (store) {
          const state = store.getState();
          if (state.account) {
            const accountId = state.account;
            const accountSetupKey = `zcash_account_setup_${accountId}`;
            localStorage.setItem(accountSetupKey, 'true');
          } else {
            // Fallback: save a general flag if account ID not available
            localStorage.setItem('zcash_account_setup_complete', 'true');
          }
        } else {
          // Fallback: save a general flag if store not available
          localStorage.setItem('zcash_account_setup_complete', 'true');
        }
      } catch (e) {
        console.warn('Failed to save account setup flag:', e);
      }
    }
    
    if (resolvePromise) {
      resolvePromise(password);
      setResolvePromise(null);
    }
  }, [resolvePromise]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(null);
      setResolvePromise(null);
    }
  }, [resolvePromise]);

  return (
    <KeyExportContext.Provider value={{ requestKeyExport }}>
      {children}
      <KeyExportDialog
        open={isOpen}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </KeyExportContext.Provider>
  );
}

export function useKeyExport() {
  const context = useContext(KeyExportContext);
  if (!context) {
    throw new Error('useKeyExport must be used within KeyExportProvider');
  }
  return context;
}

