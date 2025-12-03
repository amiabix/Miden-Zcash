/**
 * Zcash Service
 * 
 * Service for initializing and managing the Zcash module.
 * 
 * Location: miden-wallet/src/modules/zcash/services/zcashService.ts
 */

// Dynamic import to avoid bundling issues
import type { ZcashModule } from '@miden/zcash-integration/wallet';
import { createMidenWalletAdapter } from './midenWalletAdapter';

let zcashModule: ZcashModule | null = null;
let isInitialized = false;

/**
 * Initialize Zcash module
 */
export async function initializeZcash(): Promise<ZcashModule> {
  if (isInitialized && zcashModule) {
    return zcashModule;
  }

  if (typeof window === 'undefined') {
    throw new Error('Zcash initialization requires browser environment');
  }

  const store = (window as any).__MIDEN_SDK_STORE__;
  if (!store) {
    throw new Error('Miden wallet store not available');
  }

  const state = store.getState();
  if (state.isLoading) {
    console.warn('Miden wallet is still initializing');
  }

  const midenWalletAdapter = createMidenWalletAdapter();
  const useBackendProxy = process.env.NEXT_PUBLIC_USE_BACKEND_RPC_PROXY === 'true' || 
                          !process.env.NEXT_PUBLIC_ZCASH_RPC_ENDPOINT; // Use proxy if no direct endpoint configured
  
  const configuredEndpoint = process.env.NEXT_PUBLIC_ZCASH_RPC_ENDPOINT;
  const defaultEndpoint = midenWalletAdapter.getNetwork() === 'testnet' 
    ? 'http://localhost:18232' 
    : 'http://localhost:8232';
  const rpcEndpoint = configuredEndpoint || defaultEndpoint;
  const walletNetwork = midenWalletAdapter.getNetwork();
  
  let endpointToCheck = rpcEndpoint;
  let skipNetworkCheck = false;
  
  if (useBackendProxy) {
    skipNetworkCheck = true;
  }
  
  const isMainnetRPC = !skipNetworkCheck && (
    endpointToCheck.includes('mainnet') || 
    (endpointToCheck.includes('zec.nownodes.io') && !endpointToCheck.includes('testnet')) || 
    endpointToCheck.includes('8232') // mainnet default port
  );
  const isTestnetRPC = !skipNetworkCheck && (
    endpointToCheck.includes('testnet') || 
    endpointToCheck.includes('18232') // testnet default port
  );
  
  const allowNetworkMismatch = process.env.NEXT_PUBLIC_ALLOW_NETWORK_MISMATCH === 'true';
  
  if (!skipNetworkCheck && walletNetwork === 'testnet' && isMainnetRPC && !isTestnetRPC) {
    if (!allowNetworkMismatch) {
      throw new Error('Network mismatch: Wallet is testnet but RPC appears to be mainnet');
    }
  }
  
  if (!skipNetworkCheck && walletNetwork === 'mainnet' && isTestnetRPC && !isMainnetRPC) {
    if (!allowNetworkMismatch) {
      throw new Error('Network mismatch: Wallet is mainnet but RPC appears to be testnet');
    }
  }

  let zcashSDK: any;
  try {
    zcashSDK = await import('@miden/zcash-integration/wallet');
  } catch (importErr: any) {
    const importErrorMsg = importErr?.message || importErr?.toString() || 'Unknown import error';
    console.error('Failed to import Zcash SDK:', importErr);
    throw new Error(
      `Failed to import Zcash SDK: ${importErrorMsg}. ` +
      `Please ensure the package is installed: pnpm install @miden/zcash-integration`
    );
  }
  
  if (!zcashSDK) {
    throw new Error('Failed to import Zcash SDK: module is undefined');
  }
  
  const { createZcashModule } = zcashSDK;
  
  if (!createZcashModule || typeof createZcashModule !== 'function') {
    const availableExports = Object.keys(zcashSDK).join(', ') || 'none';
    throw new Error(
      `Failed to import Zcash SDK: createZcashModule is not a function. ` +
      `Available exports: ${availableExports}. ` +
      `Module type: ${typeof zcashSDK}`
    );
  }
  
  const provingServiceUrl = process.env.NEXT_PUBLIC_ZCASH_PROVING_SERVICE || 'http://localhost:8081';
  
  try {
    zcashModule = createZcashModule({
      midenWallet: midenWalletAdapter,
      rpcEndpoint: useBackendProxy ? '/api/zcash/rpc' : rpcEndpoint,
      rpcCredentials: useBackendProxy ? undefined : (process.env.NEXT_PUBLIC_ZCASH_RPC_USER && process.env.NEXT_PUBLIC_ZCASH_RPC_PASSWORD) ? {
        username: process.env.NEXT_PUBLIC_ZCASH_RPC_USER,
        password: process.env.NEXT_PUBLIC_ZCASH_RPC_PASSWORD
      } : undefined,
      rpcApiKey: useBackendProxy ? undefined : process.env.NEXT_PUBLIC_ZCASH_RPC_API_KEY,
      useBackendProxy: useBackendProxy,
      backendProxyUrl: '/api/zcash/rpc',
      proofGenerationMode: 'auto',
      delegatedProverUrl: provingServiceUrl,
      wasmPath: '/zcash_prover_wasm_bg.wasm',
      syncInterval: 60000
    } as any);
    
    try {
      await zcashModule.initialize();
    } catch (initError: any) {
      const errorMsg = initError?.message || '';
      if (errorMsg.includes('RPC') || errorMsg.includes('Load failed') || errorMsg.includes('Failed to fetch')) {
        console.warn('Zcash initialized in offline mode:', errorMsg);
      } else {
        throw initError;
      }
    }
  } catch (importError: any) {
    if (importError.message && (
      importError.message.includes('recursive use') ||
      importError.message.includes('unsafe aliasing') ||
      importError.message.includes('borrow')
    )) {
      throw new Error('Rust/WASM borrow checker error. Wait a few seconds and try again.');
    }
    
    throw new Error(`Failed to import Zcash SDK: ${importError.message}`);
  }

  isInitialized = true;
  return zcashModule;
}

/**
 * Get Zcash module instance
 * 
 * Throws if not initialized
 */
export function getZcashModule(): ZcashModule {
  if (!zcashModule || !isInitialized) {
    throw new Error('Zcash module not initialized. Call initializeZcash() first.');
  }
  return zcashModule;
}

/**
 * Check if Zcash module is initialized
 */
export function isZcashInitialized(): boolean {
  return isInitialized && zcashModule !== null;
}

/**
 * Shutdown Zcash module
 */
export async function shutdownZcash(): Promise<void> {
  if (zcashModule) {
    await zcashModule.shutdown();
    zcashModule = null;
    isInitialized = false;
  }
}

/**
 * Check if RPC is connected
 */
export function isRPCConnected(): boolean {
  if (!zcashModule || !isInitialized) {
    return false;
  }
  return zcashModule.isRPCConnected();
}

/**
 * Get RPC endpoint
 */
export function getRPCEndpoint(): string {
  if (!zcashModule || !isInitialized) {
    return '';
  }
  return zcashModule.getRPCEndpoint();
}

/**
 * Refresh RPC connection status
 */
export async function refreshRPCConnection(): Promise<boolean> {
  if (!zcashModule || !isInitialized) {
    throw new Error('Zcash module not initialized. Call initializeZcash() first.');
  }
  if (typeof zcashModule.refreshRPCConnection === 'function') {
    return await zcashModule.refreshRPCConnection();
  }
  // Fallback: re-initialize
  await initializeZcash();
  return zcashModule.isRPCConnected();
}

