/**
 * Miden Wallet Adapter for Zcash Integration
 * 
 * Adapts the Miden browser wallet to the MidenWalletAPI interface
 * required by the Zcash SDK.
 */

// Type definition - will be imported from SDK
export interface MidenWalletAPI {
  getActiveAccount(): Promise<{ id: string; name: string; publicKey: Uint8Array }>;
  exportPrivateKey(accountId: string): Promise<Uint8Array>;
  getAccounts(): Promise<Array<{ id: string; name: string }>>;
  onAccountChange(callback: (account: { id: string; name: string }) => void): () => void;
  getNetwork(): 'mainnet' | 'testnet';
}

/**
 * Get the SDK store instance
 */
function getSDKStore(): any {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as any).__MIDEN_SDK_STORE__;
}

/**
 * Mutex to prevent concurrent WebClient access
 * Rust/WASM doesn't allow multiple WebClient instances or concurrent access
 */
let webClientMutex: Promise<void> = Promise.resolve();
let isWebClientInUse = false;
let lastWebClientUse = 0;
const MIN_TIME_BETWEEN_USES = 3000; // 3 seconds minimum between WebClient uses

/**
 * Rate limiting for private key export
 * Prevents malicious scripts from repeatedly requesting key export
 */
let keyExportAttempts: number[] = [];
const MAX_KEY_EXPORT_ATTEMPTS = 3; // Maximum attempts per hour
const KEY_EXPORT_RATE_LIMIT_WINDOW = 3600000; // 1 hour in milliseconds
let lastKeyExportTime = 0;
const MIN_TIME_BETWEEN_KEY_EXPORTS = 60000; // 1 minute minimum between exports

/**
 * Acquire WebClient mutex - ensures only one WebClient operation at a time
 */
async function acquireWebClientMutex(): Promise<() => void> {
  // Wait for any pending operations
  await webClientMutex;
  
  // Ensure minimum time has passed since last use
  const timeSinceLastUse = Date.now() - lastWebClientUse;
  if (timeSinceLastUse < MIN_TIME_BETWEEN_USES) {
    const waitTime = MIN_TIME_BETWEEN_USES - timeSinceLastUse;
    // Waiting before WebClient access to prevent concurrent access
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  // Create a new promise that will resolve when we release
  let release: () => void;
  webClientMutex = new Promise((resolve) => {
    release = resolve;
  });
  
  // Mark as in use
  isWebClientInUse = true;
  lastWebClientUse = Date.now();
  
  // Return release function
  return () => {
    isWebClientInUse = false;
    // Add small delay after release
    setTimeout(() => {
      release();
    }, 500);
  };
}

/**
 * Wait for wallet to finish any ongoing operations
 */
async function waitForWalletReady(maxWaitMs: number = 15000): Promise<void> {
  const startTime = Date.now();
  
  // Wait for mutex to be free
  while (isWebClientInUse && (Date.now() - startTime) < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Additional safety wait
  if (isWebClientInUse) {
        // WebClient still in use, waiting additional time
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Ensure minimum time since last use
  const timeSinceLastUse = Date.now() - lastWebClientUse;
  if (timeSinceLastUse < MIN_TIME_BETWEEN_USES) {
    const waitTime = MIN_TIME_BETWEEN_USES - timeSinceLastUse;
        // Additional safety wait
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}

/**
 * Create MidenWalletAPI adapter for this wallet
 */
export function createMidenWalletAdapter(): MidenWalletAPI {
  return {
    /**
     * Get the currently active Miden account
     */
    async getActiveAccount() {
      // Access SDK store directly
      if (typeof window === 'undefined') {
        throw new Error('Wallet not available');
      }

      const store = getSDKStore();
      if (!store) {
        throw new Error('SDK store not initialized. Please wait for wallet to initialize.');
      }

      const state = store.getState();
      const account = state?.account;
      
      if (!account || account === '') {
        throw new Error('No account found. Please create or import a wallet first.');
      }

      return {
        id: account,
        name: 'Miden Account',
        publicKey: new Uint8Array(32) // Placeholder - actual public key would come from wallet
      };
    },

    /**
     * Request private key for an account
     */
    async exportPrivateKey(accountId: string): Promise<Uint8Array> {
      const now = Date.now();
      keyExportAttempts = keyExportAttempts.filter(
        timestamp => now - timestamp < KEY_EXPORT_RATE_LIMIT_WINDOW
      );
      
      if (keyExportAttempts.length >= MAX_KEY_EXPORT_ATTEMPTS) {
        throw new Error(`Too many key export attempts. Maximum ${MAX_KEY_EXPORT_ATTEMPTS} attempts per hour.`);
      }
      
      if (lastKeyExportTime > 0 && now - lastKeyExportTime < MIN_TIME_BETWEEN_KEY_EXPORTS) {
        const waitTime = Math.ceil((MIN_TIME_BETWEEN_KEY_EXPORTS - (now - lastKeyExportTime)) / 1000);
        throw new Error(`Key export rate limited. Please wait ${waitTime} seconds.`);
      }
      
      keyExportAttempts.push(now);
      lastKeyExportTime = now;
      
      let password: string | null = null;
      const accountSetupKey = `zcash_account_setup_${accountId}`;
      const isAccountSetup = typeof window !== 'undefined' && 
                            localStorage.getItem(accountSetupKey) === 'true';
      
      if (typeof window !== 'undefined') {
        const keyExportModule = (window as any).__KEY_EXPORT_MODULE__;
        if (keyExportModule && typeof keyExportModule.requestKeyExport === 'function') {
          if (isAccountSetup) {
            password = '';
          } else {
            password = await keyExportModule.requestKeyExport();
            if (!password) {
              throw new Error('User denied access to private key');
            }
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem(accountSetupKey, 'true');
              } catch (e) {
                console.warn('Failed to save account setup flag:', e);
              }
            }
          }
        } else {
          const confirmed = window.confirm(
            'This will export your private key for Zcash integration.\n\n' +
            'Keys derived this way cannot be recovered in standard Zcash wallets.\n\n' +
            'Continue?'
          );
          if (!confirmed) {
            throw new Error('User denied access to private key');
          }
        }
      }

      try {
        await waitForWalletReady(15000);
        
        const store = getSDKStore();
        if (store) {
          const state = store.getState();
          if (state.isLoading) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
        
        const release = await acquireWebClientMutex();
        
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const { WebClient, Address, AccountFile } = await import("@demox-labs/miden-sdk");
          const { RPC_ENDPOINT } = await import("@/lib/constants");
          
          const client = await WebClient.createClient(RPC_ENDPOINT);
          
          try {
            const accountAddress = Address.fromBech32(accountId);
            const accountFile = await client.exportAccountFile(accountAddress.accountId());
            const serialized = accountFile.serialize();
            
            const accountFileArray = Array.from(serialized);
            const accountFileBuffer = new Uint8Array(accountFileArray);
            const hashBuffer = await crypto.subtle.digest('SHA-256', accountFileBuffer);
            const privateKeyBytes = new Uint8Array(hashBuffer);
            
            return privateKeyBytes;
          } finally {
            client.terminate();
          }
        } finally {
          release();
        }
      } catch (error: any) {
        const errorMsg = error?.message || error?.toString() || 'Unknown error';
        
        if (errorMsg.includes('recursive use') || errorMsg.includes('unsafe aliasing') || errorMsg.includes('borrow')) {
          throw new Error('WebClient is currently in use. Please wait 10-15 seconds and try again.');
        }
        
        throw new Error(`Failed to export private key: ${errorMsg}`);
      }
    },

    /**
     * Get all accounts
     */
    async getAccounts() {
      // Access SDK store
      if (typeof window === 'undefined') {
        return [];
      }

      const store = getSDKStore();
      if (!store) {
        return [];
      }

      const state = store.getState();
      const account = state?.account;
      
      if (!account || account === '') {
        return [];
      }

      return [{
        id: account,
        name: 'Miden Account'
      }];
    },

    /**
     * Subscribe to account changes
     */
    onAccountChange(callback: (account: { id: string; name: string }) => void): () => void {
      // Subscribe to SDK store changes
      if (typeof window === 'undefined') {
        return () => {};
      }

      const store = getSDKStore();
      if (!store) {
        return () => {};
      }

      // Subscribe to account changes in the store
      const unsubscribe = store.subscribe((state: any) => {
        if (state?.account && state.account !== '') {
          callback({
            id: state.account,
            name: 'Miden Account'
          });
        }
      });

      return unsubscribe;
    },

    getNetwork(): 'mainnet' | 'testnet' {
      if (process.env.NEXT_PUBLIC_NETWORK) {
        return process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
      }

      try {
        const { RPC_ENDPOINT } = require('@/lib/constants');
        if (RPC_ENDPOINT) {
          if (RPC_ENDPOINT.includes('testnet')) {
            return 'testnet';
          }
          if (RPC_ENDPOINT.includes('devnet')) {
            return 'testnet';
          }
          if (RPC_ENDPOINT.includes('mainnet')) {
            return 'mainnet';
          }
          return 'testnet';
        }
      } catch (e) {
        // Constants not available
      }

      return 'testnet';
    }
  };
}

