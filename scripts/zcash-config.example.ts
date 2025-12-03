/**
 * ZcashProvider Configuration Template
 * 
 * Copy this file to your project and customize for your environment
 */

import { ZcashProvider } from '../src/provider/ZcashProvider';
import type { ZcashProviderConfig } from '../src/types';

/**
 * Testnet Configuration (Recommended for development)
 */
export const testnetConfig: ZcashProviderConfig = {
  network: 'testnet',
  
  // Standard RPC endpoint (for transparent transactions and general queries)
  rpcEndpoint: 'https://zcash-testnet.horizenlabs.io',
  
  // Lightwalletd endpoint (for shielded operations: tree states, compact blocks, witness data)
  lightwalletdUrl: 'https://testnet-lightwalletd.zecwallet.co:9067',
  
  // RPC credentials (not needed for public endpoints)
  rpcCredentials: undefined,
  
  // Proof generation mode
  proofGenerationMode: 'client', // 'client' | 'delegated' | 'hybrid'
  
  // Delegated prover URL (if using delegated proving service)
  delegatedProverUrl: undefined,
  
  // Sync interval (milliseconds)
  syncInterval: 60000, // 1 minute
  
  // Cache size
  cacheSize: 1000
};

/**
 * Mainnet Configuration (Production)
 * 
 * WARNING: Only use with real funds after thorough testing
 */
export const mainnetConfig: ZcashProviderConfig = {
  network: 'mainnet',
  
  // Use your own node or trusted RPC provider
  rpcEndpoint: 'https://your-mainnet-rpc-endpoint.com',
  lightwalletdUrl: 'https://your-lightwalletd-endpoint.com:9067',
  
  // RPC credentials (if required)
  rpcCredentials: {
    username: 'your-username',
    password: 'your-password'
  },
  
  proofGenerationMode: 'client',
  delegatedProverUrl: undefined,
  syncInterval: 60000,
  cacheSize: 1000
};

/**
 * Alternative Testnet Endpoints
 */
export const alternativeTestnetConfigs = {
  // Option 1: ZecWallet Lightwalletd
  zecwallet: {
    ...testnetConfig,
    lightwalletdUrl: 'https://testnet-lightwalletd.zecwallet.co:9067'
  },
  
  // Option 2: Nighthawk Lightwalletd
  nighthawk: {
    ...testnetConfig,
    lightwalletdUrl: 'https://testnet.lightwalletd.com:9067'
  },
  
  // Option 3: ECC Lightwalletd (may be rate-limited)
  ecc: {
    ...testnetConfig,
    lightwalletdUrl: 'https://lightwalletd.testnet.electriccoin.co:9067'
  },
  
  // Option 4: Horizen Labs (transparent RPC only)
  horizen: {
    ...testnetConfig,
    rpcEndpoint: 'https://zcash-testnet.horizenlabs.io',
    lightwalletdUrl: undefined // No lightwalletd support
  }
};

/**
 * Example: Create and initialize provider
 */
export async function createZcashProvider(config: ZcashProviderConfig = testnetConfig) {
  const provider = new ZcashProvider(config);
  await provider.initialize();
  return provider;
}

/**
 * Example usage:
 * 
 * import { createZcashProvider, testnetConfig } from './zcash-config';
 * 
 * const provider = await createZcashProvider(testnetConfig);
 * 
 * // Use provider for transactions
 * const account = await provider.getActiveZcashAccount();
 * console.log('Shielded address:', account.zAddress);
 */
